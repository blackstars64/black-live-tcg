// ─── Matcher pHash — recherche par distance de Hamming ───────────
// Charge tous les hashes en mémoire au démarrage (~2-3 MB pour 80K cartes).
// findCardByHash : ~5ms pour 80K entrées (loop JS optimisée).

import * as SQLite from 'expo-sqlite';
import { PHASH_DB_PATH } from './downloader';
import { computeHash } from './hasher';
import type { GameType } from '../../types/card';

// ─── Types ────────────────────────────────────────────────────────

export interface PHashMatch {
  cardId: string;
  game: GameType;
  nameEn: string;
  setCode: string;
  setName: string;
  number: string;
  rarity: string | null;
  imageUrl: string | null;
  distance: number;    // 0 (identique) → 64 (opposé). < 10 = bon match
  confidence: number;  // 0-1 dérivé de la distance
}

interface DbRow {
  id: string;
  game: string;
  name_en: string;
  set_code: string;
  set_name: string;
  number: string;
  rarity: string | null;
  image_url: string | null;
  dhash: string;
}

// ─── Cache mémoire ────────────────────────────────────────────────

let hashCache: DbRow[] | null = null;
let db: SQLite.SQLiteDatabase | null = null;

// ─── Hamming distance entre deux hashes hex 16 chars (64 bits) ───

function hammingDistance(h1: string, h2: string): number {
  let dist = 0;
  const len = Math.min(h1.length, h2.length);
  for (let i = 0; i < len; i++) {
    const xor = parseInt(h1[i], 16) ^ parseInt(h2[i], 16);
    // popcount 4 bits
    dist += (xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1);
  }
  return dist;
}

function distanceToConfidence(dist: number): number {
  if (dist === 0) return 1.0;
  if (dist <= 5) return 0.95;
  if (dist <= 10) return 0.85;
  if (dist <= 15) return 0.70;
  return Math.max(0, 1 - dist / 64);
}

// ─── Init ─────────────────────────────────────────────────────────

/**
 * Charge tous les hashes depuis phash.db en mémoire.
 * À appeler une fois au démarrage (ou après téléchargement DB).
 * @param game Filtrer par jeu pour réduire l'empreinte mémoire (optionnel)
 */
export async function initPHashMatcher(game?: GameType): Promise<void> {
  try {
    db = SQLite.openDatabaseSync(PHASH_DB_PATH);
    const query = game
      ? `SELECT id, game, name_en, set_code, set_name, number, rarity, image_url, dhash FROM cards WHERE game = ? AND dhash IS NOT NULL`
      : `SELECT id, game, name_en, set_code, set_name, number, rarity, image_url, dhash FROM cards WHERE dhash IS NOT NULL`;

    const rows = game
      ? db.getAllSync<DbRow>(query, [game])
      : db.getAllSync<DbRow>(query);

    hashCache = rows;
    console.log(`[phash] ${rows.length} hashes chargés en mémoire${game ? ` (${game})` : ''}`);
  } catch (err) {
    console.error('[phash] initPHashMatcher échoué:', err);
    hashCache = null;
  }
}

export function isPHashReady(): boolean {
  return hashCache !== null && hashCache.length > 0;
}

// ─── Recherche principale ─────────────────────────────────────────

/**
 * Identifie une carte depuis son image URI.
 * Retourne null si la DB n'est pas chargée ou si aucun match < seuil.
 */
export async function findCardByHash(
  imageUri: string,
  game?: GameType,
  maxDistance = 10
): Promise<PHashMatch | null> {
  if (!hashCache || hashCache.length === 0) return null;

  let hash: string;
  try {
    const result = await computeHash(imageUri);
    hash = result.hash;
    console.log(`[phash] hash calculé: ${hash} (${result.method})`);
  } catch (err) {
    console.error('[phash] computeHash échoué:', err);
    return null;
  }

  let bestDist = Infinity;
  let bestRow: DbRow | null = null;

  const rows = game ? hashCache.filter(r => r.game === game) : hashCache;

  for (const row of rows) {
    if (!row.dhash) continue;
    const dist = hammingDistance(hash, row.dhash);
    if (dist < bestDist) {
      bestDist = dist;
      bestRow = row;
      if (dist === 0) break; // match parfait
    }
  }

  if (!bestRow || bestDist > maxDistance) {
    console.log(`[phash] aucun match (best distance: ${bestDist})`);
    return null;
  }

  return {
    cardId: bestRow.id,
    game: bestRow.game as GameType,
    nameEn: bestRow.name_en,
    setCode: bestRow.set_code,
    setName: bestRow.set_name,
    number: bestRow.number,
    rarity: bestRow.rarity,
    imageUrl: bestRow.image_url,
    distance: bestDist,
    confidence: distanceToConfidence(bestDist),
  };
}
