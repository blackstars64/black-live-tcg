// ─── Cache SQLite local (cartes + prix) ─────────────────────────
// TTL prix : 24h — TTL cartes : infini (données stables)
import type { Card, CardPrice } from '../../types/card';

export async function getCachedCard(cardId: string): Promise<Card | null> {
  // TODO P3 : implémenter avec expo-sqlite
  return null;
}

export async function cacheCard(card: Card): Promise<void> {
  // TODO P3
}

export async function getCachedPrice(cardId: string): Promise<CardPrice | null> {
  // TODO P3
  return null;
}

export async function cachePrice(price: CardPrice): Promise<void> {
  // TODO P3
}
