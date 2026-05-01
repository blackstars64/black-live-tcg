// ─── Fallback prix — APIs officielles des jeux ────────────────────
import type { CardLanguage, GameType } from '../../types/card';

export interface FallbackPrice {
  priceNmLow: number | null;
  priceTrend: number | null;
  source: 'scryfall' | 'pokemon-tcg' | 'ygoprodeck';
  currency: 'EUR' | 'USD';
}

const FETCH_TIMEOUT_MS = 8000;

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
// Scryfall `prices.eur` = prix Cardmarket officiel (partenariat).
// Toujours utiliser le nom EN → carte EN → prices.eur.
async function fetchScryfallPrice(
  name: string,
  language: CardLanguage
): Promise<FallbackPrice | null> {
  try {
    const encoded = encodeURIComponent(name);
    const scryfallLang = LANG_TO_SCRYFALL[language];

    type ScryfallRaw = {
      object?: string;
      prices?: { eur?: string | null; eur_foil?: string | null; usd?: string | null };
      name?: string;
      data?: ScryfallRaw[];
    };

    async function fetchCard(url: string): Promise<ScryfallRaw | null> {
      const res = await fetchWithTimeout(url);
      if (!res.ok) return null;
      const json = await res.json() as ScryfallRaw;
      if (json.object === 'list') return json.data?.[0] ?? null;
      if (json.object === 'error') return null;
      return json;
    }

    function extractPrice(card: ScryfallRaw): number | null {
      // prices.eur = prix Cardmarket NM EN. Priorité EUR sur USD.
      const eur = card.prices?.eur ? parseFloat(card.prices.eur) : null;
      const usd = card.prices?.usd ? parseFloat(card.prices.usd) : null;
      return eur ?? (usd != null ? Math.round(usd * 0.92 * 100) / 100 : null);
    }

    // Étape 1 : chercher la version FR pour récupérer le nom EN exact
    if (scryfallLang && language !== 'en') {
      const frCard = await fetchCard(
        `https://api.scryfall.com/cards/search?q=name:${encoded}+lang:${scryfallLang}&unique=prints&order=released`
      );

      if (frCard) {
        // Essayer les prix sur la version FR d'abord
        const frPrice = extractPrice(frCard);
        if (frPrice != null) {
          return { priceNmLow: frPrice, priceTrend: null, source: 'scryfall', currency: 'EUR' };
        }

        // Prix null sur la version FR → récupérer la version EN via le nom anglais
        // Le champ `name` Scryfall est TOUJOURS le nom anglais, même pour les versions FR
        const enName = frCard.name;
        if (enName) {
          const enCard = await fetchCard(
            `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(enName)}`
          );
          const enPrice = enCard ? extractPrice(enCard) : null;
          if (enPrice != null) {
            return { priceNmLow: enPrice, priceTrend: null, source: 'scryfall', currency: 'EUR' };
          }
        }
      }

      // Étape 1b : premier mot seulement (tolère erreurs OCR)
      const firstWord = name.trim().split(/\s+/)[0];
      if (firstWord.length > 3 && firstWord !== name.trim()) {
        const firstWordCard = await fetchCard(
          `https://api.scryfall.com/cards/search?q=${encodeURIComponent(firstWord)}+lang:${scryfallLang}&unique=prints&order=released`
        );
        if (firstWordCard) {
          const enName = firstWordCard.name;
          if (enName) {
            const enCard = await fetchCard(
              `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(enName)}`
            );
            const enPrice = enCard ? extractPrice(enCard) : null;
            if (enPrice != null) {
              return { priceNmLow: enPrice, priceTrend: null, source: 'scryfall', currency: 'EUR' };
            }
          }
        }
      }
    }

    // Étape 2 : recherche EN fuzzy (nom anglais direct)
    const enCard = await fetchCard(
      `https://api.scryfall.com/cards/named?fuzzy=${encoded}`
    );
    if (enCard) {
      const price = extractPrice(enCard);
      if (price != null) {
        return { priceNmLow: price, priceTrend: null, source: 'scryfall', currency: 'EUR' };
      }
    }

    return null;
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
