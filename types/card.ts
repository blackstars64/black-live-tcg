// ─── Types cartes TCG ───────────────────────────────────────────
export type GameType = 'mtg' | 'pokemon' | 'yugioh';

export interface Card {
  id: string;
  name: string;
  nameEn: string;
  game: GameType;
  set: string;
  setCode: string;
  number: string;
  language: string;
  imageUrl: string | null;
  oracleId: string | null;
}

export interface CardPrice {
  cardId: string;
  priceAvg: number | null;
  priceLow: number | null;
  priceTrend: number | null;
  currency: 'EUR';
  fetchedAt: string; // ISO date
}

export interface ScanResult {
  card: Card;
  price: CardPrice | null;
  confidence: number; // 0-1 (OCR confidence)
  scannedAt: string; // ISO date
}
