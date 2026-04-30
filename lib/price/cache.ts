// ─── Cache SQLite des prix avec TTL ──────────────────────────────
// TTL : 6h pour les prix Cardmarket, 24h pour les fallback APIs.
// Déduplication : une seule requête en cours par (cardId, language).
import * as SQLite from 'expo-sqlite';

import type { CardLanguage } from '../../types/card';

// ─── TTL ──────────────────────────────────────────────────────────
const TTL_CARDMARKET_MS = 6 * 60 * 60 * 1000;
const TTL_FALLBACK_MS = 24 * 60 * 60 * 1000;

// ─── DB ───────────────────────────────────────────────────────────
// Ne jamais passer ':memory:' — crée un fichier littéral au lieu d'une DB en mémoire
const db = SQLite.openDatabaseSync('blacklivetcg.db');

export interface CachedPrice {
  cardId: string;
  language: CardLanguage;
  priceNmLow: number | null;
  priceTrend: number | null;
  productUrl: string | null;
  fetchedAt: number; // timestamp ms
  source: 'cardmarket' | 'fallback';
}

// ─── Déduplication des requêtes simultanées ───────────────────────
const pendingRequests = new Map<string, Promise<CachedPrice | null>>();

function cacheKey(cardId: string, language: CardLanguage): string {
  return `${cardId}:${language}`;
}

// ─── Init schema ──────────────────────────────────────────────────
export async function initPriceCache(): Promise<void> {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS price_cache (
      card_id TEXT NOT NULL,
      language TEXT NOT NULL,
      price_nm_low REAL,
      price_trend REAL,
      product_url TEXT,
      fetched_at INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'cardmarket',
      PRIMARY KEY (card_id, language)
    );
  `);
}

// ─── Lecture avec TTL ─────────────────────────────────────────────
async function fetchFromDb(cardId: string, language: CardLanguage): Promise<CachedPrice | null> {
  const row = db.getFirstSync<{
    price_nm_low: number | null;
    price_trend: number | null;
    product_url: string | null;
    fetched_at: number;
    source: 'cardmarket' | 'fallback';
  }>(
    'SELECT price_nm_low, price_trend, product_url, fetched_at, source FROM price_cache WHERE card_id = ? AND language = ?',
    [cardId, language]
  );

  if (!row) return null;

  const ttl = row.source === 'cardmarket' ? TTL_CARDMARKET_MS : TTL_FALLBACK_MS;
  const isExpired = Date.now() - row.fetched_at > ttl;
  if (isExpired) return null;

  return {
    cardId,
    language,
    priceNmLow: row.price_nm_low,
    priceTrend: row.price_trend,
    productUrl: row.product_url,
    fetchedAt: row.fetched_at,
    source: row.source,
  };
}

export async function getCachedPrice(
  cardId: string,
  language: CardLanguage
): Promise<CachedPrice | null> {
  const key = cacheKey(cardId, language);

  // Déduplication : retourner la Promise en cours si elle existe
  const pending = pendingRequests.get(key);
  if (pending) return pending;

  const promise = fetchFromDb(cardId, language).finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
}

// ─── Écriture ─────────────────────────────────────────────────────
export async function setCachedPrice(price: CachedPrice): Promise<void> {
  db.runSync(
    `INSERT OR REPLACE INTO price_cache
      (card_id, language, price_nm_low, price_trend, product_url, fetched_at, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      price.cardId,
      price.language,
      price.priceNmLow,
      price.priceTrend,
      price.productUrl,
      price.fetchedAt,
      price.source,
    ]
  );
}
