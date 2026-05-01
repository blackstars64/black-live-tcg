#!/usr/bin/env ts-node
// ─── Script de build DB pHash ─────────────────────────────────────
// Télécharge les données bulk des 3 TCG, calcule un dHash par carte,
// stocke dans phash.db. À uploader ensuite sur GitHub Releases.
//
// Usage :
//   npx ts-node scripts/build-phash-db.ts
//   npx ts-node scripts/build-phash-db.ts --game mtg
//   npx ts-node scripts/build-phash-db.ts --game pokemon
//   npx ts-node scripts/build-phash-db.ts --game yugioh
//
// Dépendances (installer avant) :
//   npm install --save-dev sharp better-sqlite3 @types/better-sqlite3 ts-node typescript

import sharp from 'sharp';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// ─── Config ───────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, '../phash.db');
const CONCURRENCY = 5;     // downloads simultanés
const RATE_DELAY_MS = 120; // ms entre requêtes

const args = process.argv.slice(2);
const GAME_FILTER = args.includes('--game')
  ? args[args.indexOf('--game') + 1]
  : null;

// ─── DB init ──────────────────────────────────────────────────────

const db = new Database(DB_PATH);

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
    dhash      TEXT,
    updated_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_game ON cards(game);
  CREATE INDEX IF NOT EXISTS idx_dhash ON cards(dhash);
`);

const insertCard = db.prepare(`
  INSERT OR REPLACE INTO cards
    (id, game, name_en, set_code, set_name, number, rarity, image_url, dhash, updated_at)
  VALUES
    (@id, @game, @name_en, @set_code, @set_name, @number, @rarity, @image_url, @dhash, @updated_at)
`);

const hasCard = db.prepare('SELECT id FROM cards WHERE id = ? AND dhash IS NOT NULL');

// ─── dHash ────────────────────────────────────────────────────────

async function computeDHash(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'BlackLiveTCG-DB-Builder/1.0' },
    });
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const { data } = await sharp(buffer)
      .resize(9, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // dHash : comparer pixels adjacents sur chaque ligne (8 lignes × 8 comparaisons = 64 bits)
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

// ─── Queue de téléchargement ──────────────────────────────────────

async function processQueue<T>(
  items: T[],
  process: (item: T, index: number) => Promise<void>,
  concurrency = CONCURRENCY
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await process(items[idx], idx);
      await new Promise(r => setTimeout(r, RATE_DELAY_MS));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// ─── MTG (Scryfall bulk) ──────────────────────────────────────────

async function buildMtg(): Promise<void> {
  console.log('\n[MTG] Téléchargement index Scryfall...');

  const indexRes = await fetch('https://api.scryfall.com/bulk-data');
  const index = await indexRes.json() as { data: Array<{ type: string; download_uri: string }> };
  const defaultCards = index.data.find(d => d.type === 'default_cards');
  if (!defaultCards) throw new Error('Scryfall bulk default-cards introuvable');

  console.log('[MTG] Téléchargement bulk data (~100MB)...');
  const bulkRes = await fetch(defaultCards.download_uri);
  const cards = await bulkRes.json() as Array<{
    id: string;
    oracle_id: string;
    name: string;
    set: string;
    set_name: string;
    collector_number: string;
    rarity: string;
    lang: string;
    image_uris?: { small: string };
    card_faces?: Array<{ image_uris?: { small: string } }>;
  }>;

  // Garder uniquement cartes EN (1 image par oracle_id)
  const seen = new Set<string>();
  const enCards = cards.filter(c => {
    if (c.lang !== 'en') return false;
    if (seen.has(c.oracle_id)) return false;
    seen.add(c.oracle_id);
    return true;
  });

  console.log(`[MTG] ${enCards.length} cartes EN uniques à traiter...`);
  let done = 0;

  await processQueue(enCards, async (card) => {
    if (hasCard.get(card.id)) { done++; return; }

    const imageUrl = card.image_uris?.small ?? card.card_faces?.[0]?.image_uris?.small;
    if (!imageUrl) { done++; return; }

    const dhash = await computeDHash(imageUrl);
    insertCard.run({
      id: card.id,
      game: 'mtg',
      name_en: card.name,
      set_code: card.set.toUpperCase(),
      set_name: card.set_name,
      number: card.collector_number,
      rarity: card.rarity,
      image_url: imageUrl,
      dhash,
      updated_at: Date.now(),
    });

    done++;
    if (done % 500 === 0) process.stdout.write(`\r[MTG] ${done}/${enCards.length}`);
  });

  console.log(`\n[MTG] ✅ ${done} cartes traitées`);
}

// ─── Pokémon (PokéTCG API) ────────────────────────────────────────

async function buildPokemon(): Promise<void> {
  console.log('\n[Pokémon] Téléchargement de toutes les cartes...');

  const allCards: Array<{
    id: string;
    name: string;
    set: { id: string; name: string };
    number: string;
    rarity?: string;
    images: { small: string };
  }> = [];

  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.pokemontcg.io/v2/cards?pageSize=250&page=${page}&orderBy=id`,
      { headers: { 'User-Agent': 'BlackLiveTCG-DB-Builder/1.0' } }
    );
    const data = await res.json() as { data: typeof allCards; totalCount: number };
    allCards.push(...data.data);
    if (allCards.length >= data.totalCount) break;
    page++;
    process.stdout.write(`\r[Pokémon] ${allCards.length}/${data.totalCount} cartes`);
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n[Pokémon] ${allCards.length} cartes, calcul des hashes...`);
  let done = 0;

  await processQueue(allCards, async (card) => {
    if (hasCard.get(card.id)) { done++; return; }

    const dhash = await computeDHash(card.images.small);
    insertCard.run({
      id: card.id,
      game: 'pokemon',
      name_en: card.name,
      set_code: card.set.id.toUpperCase(),
      set_name: card.set.name,
      number: card.number,
      rarity: card.rarity ?? null,
      image_url: card.images.small,
      dhash,
      updated_at: Date.now(),
    });

    done++;
    if (done % 200 === 0) process.stdout.write(`\r[Pokémon] ${done}/${allCards.length}`);
  });

  console.log(`\n[Pokémon] ✅ ${done} cartes traitées`);
}

// ─── Yu-Gi-Oh (YGOPRODeck) ───────────────────────────────────────

async function buildYugioh(): Promise<void> {
  console.log('\n[YGO] Téléchargement bulk...');

  const res = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes');
  const data = await res.json() as {
    data: Array<{
      id: number;
      name: string;
      card_sets?: Array<{ set_code: string; set_name: string; set_number: string; set_rarity: string }>;
      card_images?: Array<{ image_url_small: string }>;
    }>;
  };

  console.log(`[YGO] ${data.data.length} cartes, calcul des hashes...`);
  let done = 0;

  await processQueue(data.data, async (card) => {
    const id = String(card.id);
    if (hasCard.get(id)) { done++; return; }

    const imageUrl = card.card_images?.[0]?.image_url_small;
    if (!imageUrl) { done++; return; }

    const primarySet = card.card_sets?.[0];
    const dhash = await computeDHash(imageUrl);

    insertCard.run({
      id,
      game: 'yugioh',
      name_en: card.name,
      set_code: primarySet?.set_code ?? '',
      set_name: primarySet?.set_name ?? '',
      number: primarySet?.set_number ?? '',
      rarity: primarySet?.set_rarity ?? null,
      image_url: imageUrl,
      dhash,
      updated_at: Date.now(),
    });

    done++;
    if (done % 500 === 0) process.stdout.write(`\r[YGO] ${done}/${data.data.length}`);
  });

  console.log(`\n[YGO] ✅ ${done} cartes traitées`);
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log(`Build pHash DB → ${DB_PATH}`);
  console.log(`Filtre jeu : ${GAME_FILTER ?? 'tous'}`);

  const start = Date.now();

  if (!GAME_FILTER || GAME_FILTER === 'mtg')     await buildMtg();
  if (!GAME_FILTER || GAME_FILTER === 'pokemon')  await buildPokemon();
  if (!GAME_FILTER || GAME_FILTER === 'yugioh')   await buildYugioh();

  const total = db.prepare('SELECT COUNT(*) as n FROM cards WHERE dhash IS NOT NULL').get() as { n: number };
  const sizeMB = (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1);

  console.log(`\n✅ DB buildée en ${Math.round((Date.now() - start) / 1000)}s`);
  console.log(`   ${total.n} cartes | ${sizeMB} MB → ${DB_PATH}`);
  console.log('\nProchaine étape : uploader phash.db sur GitHub Releases');
  console.log('puis : EXPO_PUBLIC_PHASH_DB_URL=https://github.com/.../releases/download/vX.X/phash.db');

  db.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
