// ─── Fallback prix — APIs officielles des jeux ────────────────────
// Utilisé quand le scraping Cardmarket échoue ou est bloqué.
// Best effort : retourne null sans lever d'erreur si la requête échoue.
import type { CardLanguage, GameType } from '../../types/card';

export interface FallbackPrice {
  priceNmLow: number | null;
  priceTrend: number | null;
  source: 'scryfall' | 'pokemon-tcg' | 'ygoprodeck';
  currency: 'EUR' | 'USD';
}

const FETCH_TIMEOUT_MS = 8000;

// Mapping langue → code Scryfall
const LANG_TO_SCRYFALL: Partial<Record<CardLanguage, string>> = {
  en: 'en', fr: 'fr', de: 'de', es: 'es', it: 'it',
  ja: 'ja', pt: 'pt', ru: 'ru', ko: 'ko', zh: 'zhs',
};

function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

// ─── MTG → Scryfall ───────────────────────────────────────────────
// Stratégie : cherche d'abord par nom dans la langue de la carte,
// puis par premier mot si OCR partiel, puis EN fuzzy en dernier recours.
async function fetchScryfallPrice(
  name: string,
  language: CardLanguage
): Promise<FallbackPrice | null> {
  try {
    const encoded = encodeURIComponent(name);
    const scryfallLang = LANG_TO_SCRYFALL[language];

    type ScryfallCard = { prices?: { eur?: string | null; usd?: string | null } };
    type ScryfallList = { object: string; data?: ScryfallCard[] };

    async function fetchCard(url: string): Promise<ScryfallCard | null> {
      const res = await fetchWithTimeout(url);
      if (!res.ok) return null;
      const json = await res.json() as ScryfallCard & ScryfallList;
      if (json.object === 'list') return json.data?.[0] ?? null;
      return json;
    }

    let card: ScryfallCard | null = null;

    // Étape 1 : nom dans la langue détectée (ex: nom français)
    if (scryfallLang && language !== 'en') {
      card = await fetchCard(
        `https://api.scryfall.com/cards/search?q=name:${encoded}+lang:${scryfallLang}&unique=prints&order=released`
      );
      // Étape 1b : premier mot seulement (tolère erreurs OCR sur la suite du nom)
      if (!card) {
        const firstWord = name.trim().split(/\s+/)[0];
        if (firstWord.length > 3 && firstWord !== name.trim()) {
          card = await fetchCard(
            `https://api.scryfall.com/cards/search?q=name:${encodeURIComponent(firstWord)}+lang:${scryfallLang}&unique=prints&order=released`
          );
        }
      }
    }

    // Étape 2 : nom anglais fuzzy (fallback universel)
    if (!card) {
      card = await fetchCard(
        `https://api.scryfall.com/cards/named?fuzzy=${encoded}`
      );
    }

    if (!card?.prices) return null;

    const eurPrice = card.prices.eur ? parseFloat(card.prices.eur) : null;
    const usdPrice = card.prices.usd ? parseFloat(card.prices.usd) : null;
    const priceNmLow = eurPrice ?? (usdPrice != null ? Math.round(usdPrice * 0.92 * 100) / 100 : null);

    if (priceNmLow == null) return null;

    return { priceNmLow, priceTrend: null, source: 'scryfall', currency: 'EUR' };
  } catch {
    return null;
  }
}

// ─── Pokémon TCG API ──────────────────────────────────────────────
async function fetchPokemonPrice(nameEn: string): Promise<FallbackPrice | null> {
  try {
    const apiKey = process.env.EXPO_PUBLIC_POKEMON_API_KEY;
    const headers: HeadersInit = apiKey ? { 'X-Api-Key': apiKey } : {};
    const url = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(nameEn)}"&pageSize=5`;
    const response = await fetchWithTimeout(url, { headers });
    if (!response.ok) return null;

    const data = await response.json() as {
      data?: Array<{
        tcgplayer?: {
          prices?: {
            normal?: { low?: number };
            holoRare?: { low?: number };
            reverseHolofoil?: { low?: number };
          };
        };
      }>;
    };

    const card = data.data?.[0];
    const prices = card?.tcgplayer?.prices;
    const low = prices?.normal?.low ?? prices?.holoRare?.low ?? prices?.reverseHolofoil?.low ?? null;
    if (low == null) return null;

    return {
      priceNmLow: Math.round(low * 0.92 * 100) / 100,
      priceTrend: null,
      source: 'pokemon-tcg',
      currency: 'EUR',
    };
  } catch {
    return null;
  }
}

// ─── Yu-Gi-Oh → YGOPRODeck ───────────────────────────────────────
async function fetchYgoPrice(nameEn: string): Promise<FallbackPrice | null> {
  try {
    const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(nameEn)}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;

    const data = await response.json() as {
      data?: Array<{ card_prices?: Array<{ cardmarket_price?: string }> }>;
    };

    const priceStr = data.data?.[0]?.card_prices?.[0]?.cardmarket_price;
    const price = priceStr ? parseFloat(priceStr) : null;
    if (price == null || isNaN(price)) return null;

    return { priceNmLow: price, priceTrend: null, source: 'ygoprodeck', currency: 'EUR' };
  } catch {
    return null;
  }
}

// ─── Point d'entrée ───────────────────────────────────────────────
export async function fetchFallbackPrice(
  nameEn: string,
  game: GameType,
  language: CardLanguage
): Promise<FallbackPrice | null> {
  switch (game) {
    case 'mtg':
      return fetchScryfallPrice(nameEn, language);
    case 'pokemon':
      return fetchPokemonPrice(nameEn);
    case 'yugioh':
      return fetchYgoPrice(nameEn);
  }
}
