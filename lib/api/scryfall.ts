// ─── Client Scryfall (Magic: The Gathering) ──────────────────────
// Docs      : https://scryfall.com/docs/api
// Auth      : aucune — gratuit
// Rate limit: max 10 req/s → attendre 110ms entre requêtes

// ─── Imports ─────────────────────────────────────────────────────
import type { Card, CardLanguage } from '../../types/card';

// ─── Constantes ──────────────────────────────────────────────────
const BASE_URL = 'https://api.scryfall.com';
const SCRYFALL_DELAY_MS = 110;
const TIMEOUT_MS = 8_000;

// Nos codes langue → codes Scryfall
const LANG_TO_SCRYFALL: Partial<Record<CardLanguage, string>> = {
  en: 'en',
  fr: 'fr',
  de: 'de',
  es: 'es',
  it: 'it',
  ja: 'ja',
  pt: 'pt',
  ru: 'ru',
  ko: 'ko',
  zh: 'zhs', // Simplified Chinese
};

// ─── Rate limiter ─────────────────────────────────────────────────
let lastScryfallCall = 0;

async function scryfallThrottle(): Promise<void> {
  const elapsed = Date.now() - lastScryfallCall;
  if (elapsed < SCRYFALL_DELAY_MS) {
    await new Promise<void>((r) => setTimeout(r, SCRYFALL_DELAY_MS - elapsed));
  }
  lastScryfallCall = Date.now();
}

// ─── Types réponse Scryfall ────────────────────────────────────────
interface ScryfallCardRaw {
  id: string;
  oracle_id: string;
  name: string;
  printed_name?: string;
  set: string;
  set_name: string;
  collector_number: string;
  lang: string;
  object: string;
  image_uris?: { normal: string; small: string; large: string };
  card_faces?: Array<{ image_uris?: { normal: string; small: string } }>;
}

interface ScryfallErrorRaw {
  object: 'error';
  code: string;
  status: number;
  details: string;
}

interface ScryfallListRaw {
  object: 'list';
  total_cards: number;
  data: ScryfallCardRaw[];
}

// ─── Normalisation ─────────────────────────────────────────────────
function normalizeScryfallCard(
  raw: ScryfallCardRaw,
  detectedLanguage: CardLanguage
): Card {
  const imageUrl =
    raw.image_uris?.normal ??
    raw.card_faces?.[0]?.image_uris?.normal ??
    null;

  return {
    id: raw.id,
    name: raw.printed_name ?? raw.name,
    nameEn: raw.name,
    game: 'mtg',
    set: raw.set_name,
    setCode: raw.set.toUpperCase(),
    number: raw.collector_number,
    language: detectedLanguage,
    imageUrl,
    oracleId: raw.oracle_id,
    cardmarketId: null,
  };
}

// ─── Fetch avec timeout ────────────────────────────────────────────
async function scryfallFetch(url: string): Promise<ScryfallCardRaw | null> {
  await scryfallThrottle();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const json = (await response.json()) as ScryfallCardRaw | ScryfallErrorRaw;

    if (json.object === 'error') return null;
    return json as ScryfallCardRaw;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function scryfallSearchFetch(url: string): Promise<ScryfallCardRaw | null> {
  await scryfallThrottle();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const json = (await response.json()) as ScryfallListRaw | ScryfallErrorRaw;

    if (json.object === 'error' || json.object !== 'list') return null;
    const list = json as ScryfallListRaw;
    return list.total_cards > 0 ? list.data[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Point d'entrée public ────────────────────────────────────────
/**
 * Identifie une carte MTG depuis son nom OCR et sa langue détectée.
 * Stratégie : langue détectée → EN fuzzy → fulltext search
 */
export async function identifyMtgCard(
  ocrName: string,
  language: CardLanguage
): Promise<Card | null> {
  const encodedName = encodeURIComponent(ocrName);
  const scryfallLang = LANG_TO_SCRYFALL[language];

  // Étape 1 : recherche plein-texte dans la langue détectée
  // q=culture lang:fr → cherche dans TOUT le texte FR (noms imprimés inclus)
  // "culture" trouve "Rotation des cultures" car Scryfall indexe les noms FR
  if (scryfallLang && language !== 'en') {
    const langSearch = await scryfallSearchFetch(
      `${BASE_URL}/cards/search?q=${encodedName}+lang:${scryfallLang}&unique=prints&order=released`
    );
    if (langSearch) return normalizeScryfallCard(langSearch, language);

    // Étape 1b : premier mot (tolère les erreurs OCR sur la suite du nom)
    const firstWord = ocrName.trim().split(/\s+/)[0];
    if (firstWord && firstWord.length > 3 && firstWord !== ocrName.trim()) {
      const firstWordSearch = await scryfallSearchFetch(
        `${BASE_URL}/cards/search?q=${encodeURIComponent(firstWord)}+lang:${scryfallLang}&unique=prints&order=released`
      );
      if (firstWordSearch) return normalizeScryfallCard(firstWordSearch, language);
    }
  }

  // Étape 2 : recherche EN fuzzy (nom anglais)
  const resultEn = await scryfallFetch(
    `${BASE_URL}/cards/named?fuzzy=${encodedName}`
  );
  if (resultEn) return normalizeScryfallCard(resultEn, language);

  // Étape 3 : fulltext EN (dernier recours)
  const resultSearch = await scryfallSearchFetch(
    `${BASE_URL}/cards/search?q=name:${encodedName}&unique=cards&order=name`
  );
  if (resultSearch) return normalizeScryfallCard(resultSearch, language);

  return null;
}
