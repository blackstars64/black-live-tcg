// ─── Fallback prix — APIs officielles des jeux ────────────────────
// Utilisé quand le scraping Cardmarket échoue ou est bloqué.
// Best effort : retourne null sans lever d'erreur si la requête échoue.
import type { CardLanguage, GameType } from '../../types/card';

// ─── Types ────────────────────────────────────────────────────────
export interface FallbackPrice {
  priceNmLow: number | null;
  priceTrend: number | null;
  source: 'scryfall' | 'pokemon-tcg' | 'ygoprodeck';
  currency: 'EUR' | 'USD';
}

const FETCH_TIMEOUT_MS = 8000;

function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

// ─── MTG → Scryfall ───────────────────────────────────────────────
async function fetchScryfallPrice(nameEn: string): Promise<FallbackPrice | null> {
  try {
    const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(nameEn)}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;

    const data = await response.json() as {
      prices?: { eur?: string | null; usd?: string | null };
    };

    const eurPrice = data.prices?.eur ? parseFloat(data.prices.eur) : null;
    const usdPrice = data.prices?.usd ? parseFloat(data.prices.usd) : null;

    return {
      priceNmLow: eurPrice ?? (usdPrice !== null ? usdPrice * 0.92 : null), // Conversion USD→EUR approximative
      priceTrend: null,
      source: 'scryfall',
      currency: 'EUR',
    };
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
    const low =
      prices?.normal?.low ??
      prices?.holoRare?.low ??
      prices?.reverseHolofoil?.low ??
      null;

    if (low === null) return null;

    return {
      priceNmLow: Math.round(low * 0.92 * 100) / 100, // USD → EUR
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
      data?: Array<{
        card_prices?: Array<{ cardmarket_price?: string }>;
      }>;
    };

    const priceStr = data.data?.[0]?.card_prices?.[0]?.cardmarket_price;
    const price = priceStr ? parseFloat(priceStr) : null;

    if (price === null || isNaN(price)) return null;

    return {
      priceNmLow: price,
      priceTrend: null,
      source: 'ygoprodeck',
      currency: 'EUR',
    };
  } catch {
    return null;
  }
}

// ─── Point d'entrée ───────────────────────────────────────────────
export async function fetchFallbackPrice(
  nameEn: string,
  game: GameType,
  _language: CardLanguage // ignoré pour les fallback (APIs sans filtre langue)
): Promise<FallbackPrice | null> {
  switch (game) {
    case 'mtg':
      return fetchScryfallPrice(nameEn);
    case 'pokemon':
      return fetchPokemonPrice(nameEn);
    case 'yugioh':
      return fetchYgoPrice(nameEn);
  }
}
