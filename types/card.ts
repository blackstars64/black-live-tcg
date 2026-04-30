// ─── Types cartes TCG ───────────────────────────────────────────
export type GameType = 'mtg' | 'pokemon' | 'yugioh';

// Codes langue ISO 639-1 supportés
export type CardLanguage = 'en' | 'fr' | 'de' | 'es' | 'it' | 'ja' | 'pt' | 'ru' | 'ko' | 'zh';

// Mapping langue → ID Cardmarket (utilisé pour filtrer les articles par langue)
export const CARDMARKET_LANGUAGE_ID: Record<CardLanguage, number> = {
  en: 1,
  fr: 2,
  de: 3,
  es: 4,
  it: 5,
  zh: 6,
  ja: 7,
  pt: 8,
  ru: 9,
  ko: 10,
};

// Mapping langue → libellé affiché
export const LANGUAGE_LABEL: Record<CardLanguage, string> = {
  en: 'EN',
  fr: 'FR',
  de: 'DE',
  es: 'ES',
  it: 'IT',
  zh: 'ZH',
  ja: 'JP',
  pt: 'PT',
  ru: 'RU',
  ko: 'KR',
};

// Mapping ID jeu Cardmarket
export const CARDMARKET_GAME_ID: Record<GameType, number> = {
  mtg: 1,
  yugioh: 2,
  pokemon: 3,
};

// Condition NM = 2 sur Cardmarket (1=M, 2=NM, 3=EX, 4=GD, 5=LP, 6=PL, 7=PO)
export const CARDMARKET_CONDITION_NM = 2;

export interface Card {
  id: string;
  name: string;         // Nom dans la langue scannée
  nameEn: string;       // Nom anglais normalisé (référence universelle)
  game: GameType;
  set: string;          // Nom de l'édition
  setCode: string;      // Code court de l'édition (ex: "M21", "SWSH1")
  number: string;       // Numéro de carte dans l'édition
  language: CardLanguage;
  imageUrl: string | null;
  oracleId: string | null;
  cardmarketId: number | null; // idProduct Cardmarket (mis en cache après 1er fetch)
}

export interface CardPrice {
  cardId: string;
  language: CardLanguage;   // Langue de l'exemplaire évalué
  condition: 'NM';          // Toujours NM — décision produit
  priceNmLow: number | null; // Prix minimum NM pour cette langue (€)
  currency: 'EUR';
  fetchedAt: string;         // ISO date — TTL 24h en cache
  cardmarketUrl: string | null; // URL directe vers la page Cardmarket
}

export interface ScanResult {
  card: Card;
  price: CardPrice | null;
  confidence: number; // 0-1 (confidence OCR)
  scannedAt: string;  // ISO date
}
