/**
 * build-phash-db.ts
 * Génère phash.db — base de données de dHash 64-bit pour cartes TCG.
 * Usage : npx tsx build-phash-db.ts [--game mtg|pokemon|yugioh]
 * Reprise automatique : skip les cartes déjà présentes en DB.
 */

import sharp from 'sharp';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_PATH = path.join(process.cwd(), 'phash.db');
const CONCURRENCY = 5;       // téléchargements simultanés max
const SCRYFALL_DELAY = 110;  // ms entre requêtes Scryfall (rate limit 10 req/s)
const OTHER_DELAY = 50;      // ms pour Pokémon / YGO

// ─── Argument parsing ─────────────────────────────────────────────────────────

const gameArg = process.argv.find((a) => a.startsWith('--game='))?.split('=')[1]
  ?? process.argv[process.argv.indexOf('--game') + 1];

const GAMES: Array<'mtg' | 'pokemon' | 'yugioh'> = gameArg
  ? [gameArg as 'mtg' | 'pokemon' | 'yugioh']
  : ['mtg', 'pokemon', 'yugioh'];

// ─── DB init ─────────────────────────────────────────────────────────────────

function initDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id         TEXT PRIMARY KEY,
      game       TEXT NOT NULL,
      name_en    TEXT NOT NULL,
      set_code   TEXT,
      set_name   TEXT,
      number     TEXT,
      rarity     TEXT,
      image_url  TEXT,
      dhash      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_game ON cards(game);
  `);
  return db;
}

// ─── dHash 64-bit ────────────────────────────────────────────────────────────

async function computeDHash(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());

    const { data } = await sharp(buffer)
      .resize(9, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hash = '';
    for (let row = 0; row < 8; row++) {
      let byte = 0;
      for (let col = 0; col < 8; col++) {
        if (data[row * 9 + col] > data[row * 9 + col + 1]) {
          byte |= 1 << col;
        }
      }
      hash += byte.toString(16).padStart(2, '0');
    }
    return hash; // 16 hex chars = 64 bits
  } catch {
    return null;
  }
}

// ─── Concurrency helper ───────────────────────────────────────────────────────

async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < items.length) {
      const item = items[idx++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// ─── Sleep ────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── MTG — Scryfall bulk ─────────────────────────────────────────────────────

interface ScryfallBulkItem {
  type: string;
  download_uri: string;
}

interface ScryfallCard {
  id: string;
  oracle_id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  lang: string;
  layout: string;
  image_uris?: { small: string };
  card_faces?: Array<{ image_uris?: { small: string } }>;
}

async function buildMtg(db: Database.Database): Promise<void> {
  console.log('\n[MTG] Récupération du bulk data Scryfall...');

  const bulkRes = await fetch('https://api.scryfall.com/bulk-data');
  const bulk = await bulkRes.json() as { data: ScryfallBulkItem[] };
  const defaultCards = bulk.data.find((b) => b.type === 'default_cards');
  if (!defaultCards) throw new Error('Scryfall bulk default_cards introuvable');

  console.log('[MTG] Téléchargement JSON bulk (~100MB)...');
  const dataRes = await fetch(defaultCards.download_uri);
  const cards: ScryfallCard[] = await dataRes.json();

  // Une seule image par oracle_id, carte anglaise uniquement
  const seen = new Set<string>();
  const toProcess: ScryfallCard[] = [];

  for (const card of cards) {
    if (card.lang !== 'en') continue;
    if (seen.has(card.oracle_id)) continue;
    if (!card.image_uris?.small && !card.card_faces?.[0]?.image_uris?.small) continue;
    seen.add(card.oracle_id);
    toProcess.push(card);
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO cards (id, game, name_en, set_code, set_name, number, rarity, image_url, dhash, updated_at)
    VALUES (?, 'mtg', ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const existsStmt = db.prepare('SELECT 1 FROM cards WHERE id = ?');
  let done = 0;
  const total = toProcess.length;

  console.log(`[MTG] ${total} cartes uniques à traiter...`);

  await runPool(toProcess, CONCURRENCY, async (card) => {
    if (existsStmt.get(card.id)) {
      done++;
      return;
    }

    const imageUrl =
      card.image_uris?.small ?? card.card_faces?.[0]?.image_uris?.small ?? '';

    await sleep(SCRYFALL_DELAY);
    const dhash = await computeDHash(imageUrl);

    if (dhash) {
      stmt.run(
        card.id,
        card.name,
        card.set.toUpperCase(),
        card.set_name,
        card.collector_number,
        card.rarity,
        imageUrl,
        dhash,
        Date.now()
      );
    }

    done++;
    if (done % 500 === 0 || done === total) {
      process.stdout.write(`\r[MTG] ${done}/${total} (${Math.round(done / total * 100)}%)`);
    }
  });

  console.log(`\n[MTG] ✅ Terminé — ${done} cartes traitées.`);
}

// ─── Pokémon ──────────────────────────────────────────────────────────────────

interface PokemonCard {
  id: string;
  name: string;
  set: { id: string; name: string };
  number: string;
  rarity?: string;
  images: { small: string };
}

interface PokemonPage {
  data: PokemonCard[];
  totalCount: number;
  pageSize: number;
  page: number;
  count: number;
}

async function buildPokemon(db: Database.Database): Promise<void> {
  console.log('\n[POKEMON] Récupération des cartes via PokéTCG API...');

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO cards (id, game, name_en, set_code, set_name, number, rarity, image_url, dhash, updated_at)
    VALUES (?, 'pokemon', ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const existsStmt = db.prepare('SELECT 1 FROM cards WHERE id = ?');

  let page = 1;
  let totalCount = 0;
  let done = 0;

  while (true) {
    const url = `https://api.pokemontcg.io/v2/cards?pageSize=250&page=${page}&orderBy=id`;
    const res = await fetch(url);
    if (!res.ok) break;

    const data = await res.json() as PokemonPage;
    if (page === 1) {
      totalCount = data.totalCount;
      console.log(`[POKEMON] ${totalCount} cartes au total...`);
    }

    if (data.data.length === 0) break;

    await runPool(data.data, CONCURRENCY, async (card) => {
      if (existsStmt.get(card.id)) {
        done++;
        return;
      }

      await sleep(OTHER_DELAY);
      const dhash = await computeDHash(card.images.small);

      if (dhash) {
        stmt.run(
          card.id,
          card.name,
          card.set.id.toUpperCase(),
          card.set.name,
          card.number,
          card.rarity ?? null,
          card.images.small,
          dhash,
          Date.now()
        );
      }

      done++;
      if (done % 250 === 0 || done === totalCount) {
        process.stdout.write(`\r[POKEMON] ${done}/${totalCount} (${Math.round(done / totalCount * 100)}%)`);
      }
    });

    page++;
    if (data.count < 250) break;

    await sleep(200);
  }

  console.log(`\n[POKEMON] ✅ Terminé — ${done} cartes traitées.`);
}

// ─── Yu-Gi-Oh ─────────────────────────────────────────────────────────────────

interface YgoCard {
  id: number;
  name: string;
  card_sets?: Array<{ set_code: string; set_name: string; set_number: string; set_rarity: string }>;
  card_images?: Array<{ image_url_small: string }>;
}

interface YgoApiResponse {
  data: YgoCard[];
}

async function buildYugioh(db: Database.Database): Promise<void> {
  console.log('\n[YUGIOH] Téléchargement de toutes les cartes YGOPRODeck...');

  const res = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes');
  if (!res.ok) throw new Error(`YGOPRODeck HTTP ${res.status}`);

  const json = await res.json() as YgoApiResponse;
  const cards = json.data;

  console.log(`[YUGIOH] ${cards.length} cartes à traiter...`);

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO cards (id, game, name_en, set_code, set_name, number, rarity, image_url, dhash, updated_at)
    VALUES (?, 'yugioh', ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const existsStmt = db.prepare('SELECT 1 FROM cards WHERE id = ?');

  let done = 0;
  const total = cards.length;

  await runPool(cards, CONCURRENCY, async (card) => {
    const id = String(card.id);

    if (existsStmt.get(id)) {
      done++;
      return;
    }

    const imageUrl = card.card_images?.[0]?.image_url_small;
    if (!imageUrl) {
      done++;
      return;
    }

    const primarySet = card.card_sets?.[0];

    await sleep(OTHER_DELAY);
    const dhash = await computeDHash(imageUrl);

    if (dhash) {
      stmt.run(
        id,
        card.name,
        primarySet?.set_code ?? null,
        primarySet?.set_name ?? null,
        primarySet?.set_number ?? null,
        primarySet?.set_rarity ?? null,
        imageUrl,
        dhash,
        Date.now()
      );
    }

    done++;
    if (done % 500 === 0 || done === total) {
      process.stdout.write(`\r[YUGIOH] ${done}/${total} (${Math.round(done / total * 100)}%)`);
    }
  });

  console.log(`\n[YUGIOH] ✅ Terminé — ${done} cartes traitées.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`🃏 Build pHash DB → ${DB_PATH}`);
  console.log(`Jeux : ${GAMES.join(', ')}`);

  const db = initDb();

  const start = Date.now();

  for (const game of GAMES) {
    if (game === 'mtg') await buildMtg(db);
    if (game === 'pokemon') await buildPokemon(db);
    if (game === 'yugioh') await buildYugioh(db);
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  const count = (db.prepare('SELECT COUNT(*) as n FROM cards').get() as { n: number }).n;

  console.log(`\n✅ phash.db généré — ${count} cartes — ${elapsed}s`);
  console.log(`📦 Taille : ${(fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1)} MB`);

  db.close();
}

main().catch((err) => {
  console.error('❌ Erreur :', err);
  process.exit(1);
});
