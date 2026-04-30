// ─── Pipeline orchestrateur des prix ─────────────────────────────
// Priorité : cache local → scraping Cardmarket → fallback API → null
//
// Session A implémente : scrapePriceFromSearch() et scrapePriceFromUrl()
// dans lib/price/scraper.ts — importé ici mais stubé tant que Session A n'a pas pushé.
import type { CardLanguage, GameType } from '../../types/card';
import { getCachedPrice, setCachedPrice, initPriceCache } from './cache';
import { fetchFallbackPrice } from './fallback';
import { enqueueRequest, isCircuitOpen, recordSuccess, recordFailure } from './ratelimit';

// ─── Import scraper (Session A) ───────────────────────────────────
// Si le fichier n'existe pas encore : les fonctions retournent null silencieusement
let scrapePriceFromSearch: (
  nameEn: string,
  game: GameType,
  language: CardLanguage,
  setName?: string,
  cardNumber?: string
) => Promise<ScraperResult>;

let scrapePriceFromUrl: (
  productUrl: string,
  language: CardLanguage
) => Promise<ScraperResult>;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const scraperModule = require('./scraper');
  scrapePriceFromSearch = scraperModule.scrapePriceFromSearch;
  scrapePriceFromUrl = scraperModule.scrapePriceFromUrl;
} catch {
  // Scraper pas encore disponible — fallback direct
  const notImplemented = async (): Promise<ScraperResult> => ({
    priceNmLow: null,
    priceTrend: null,
    productUrl: null,
  });
  scrapePriceFromSearch = notImplemented;
  scrapePriceFromUrl = notImplemented;
}

// ─── Types ────────────────────────────────────────────────────────
export interface ScraperResult {
  priceNmLow: number | null;
  priceTrend: number | null;
  productUrl: string | null;
}

export interface PriceResult {
  priceNmLow: number | null;
  priceTrend: number | null;
  language: CardLanguage;
  condition: 'NM';
  currency: 'EUR';
  source: 'cache' | 'cardmarket' | 'fallback';
  productUrl: string | null;
  fetchedAt: string;
}

// ─── Init (appeler au démarrage de l'app) ─────────────────────────
export { initPriceCache };

// ─── Point d'entrée public ────────────────────────────────────────
export async function getCardPrice(
  cardId: string,
  nameEn: string,
  game: GameType,
  language: CardLanguage,
  setName?: string,
  cardNumber?: string,
  cachedProductUrl?: string | null
): Promise<PriceResult | null> {
  // Étape 1 : cache local (TTL 6h Cardmarket, 24h fallback)
  const cached = await getCachedPrice(cardId, language);
  if (cached) {
    return {
      priceNmLow: cached.priceNmLow,
      priceTrend: cached.priceTrend,
      language,
      condition: 'NM',
      currency: 'EUR',
      source: 'cache',
      productUrl: cached.productUrl,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
    };
  }

  // Étape 2 : scraping Cardmarket via queue rate-limitée
  if (!isCircuitOpen()) {
    try {
      const scraperResult = await enqueueRequest(() =>
        cachedProductUrl
          ? scrapePriceFromUrl(cachedProductUrl, language)
          : scrapePriceFromSearch(nameEn, game, language, setName, cardNumber)
      );

      if (scraperResult.priceNmLow !== null) {
        await setCachedPrice({
          cardId,
          language,
          priceNmLow: scraperResult.priceNmLow,
          priceTrend: scraperResult.priceTrend,
          productUrl: scraperResult.productUrl,
          fetchedAt: Date.now(),
          source: 'cardmarket',
        });
        recordSuccess();
        return {
          priceNmLow: scraperResult.priceNmLow,
          priceTrend: scraperResult.priceTrend,
          language,
          condition: 'NM',
          currency: 'EUR',
          source: 'cardmarket',
          productUrl: scraperResult.productUrl,
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch {
      recordFailure();
      // Ne pas propager — passer au fallback
    }
  }

  // Étape 3 : fallback API officielle (Scryfall / PokéAPI / YGOPro)
  const fallback = await fetchFallbackPrice(nameEn, game, language);
  if (fallback) {
    await setCachedPrice({
      cardId,
      language,
      priceNmLow: fallback.priceNmLow,
      priceTrend: fallback.priceTrend,
      productUrl: null,
      fetchedAt: Date.now(),
      source: 'fallback',
    });
    return {
      priceNmLow: fallback.priceNmLow,
      priceTrend: fallback.priceTrend,
      language,
      condition: 'NM',
      currency: 'EUR',
      source: 'fallback',
      productUrl: null,
      fetchedAt: new Date().toISOString(),
    };
  }

  // Étape 4 : tout a échoué
  return null;
}
