// ─── Pipeline orchestrateur des prix ─────────────────────────────
// Priorité : cache local → scraping Cardmarket → fallback API → null
//
// Session A implémente : scrapePriceFromSearch() et scrapePriceFromUrl()
// dans lib/price/scraper.ts — importé ici mais stubé tant que Session A n'a pas pushé.
import type { CardLanguage, GameType } from '../../types/card';
import { getCachedPrice, setCachedPrice, initPriceCache } from './cache';
import { fetchFallbackPrice } from './fallback';
import { enqueueRequest, isCircuitOpen, recordSuccess, recordFailure } from './ratelimit';
import { scrapePriceFromSearch, scrapePriceFromUrl } from './scraper';
import type { ScraperResult } from './scraper';

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
  console.warn(`[prix] nameEn="${nameEn}" game=${game} lang=${language}`);

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
    } catch (e) {
      recordFailure();
      console.warn('[prix] scraping échoué:', e instanceof Error ? e.message : e);
    }
  } else {
    console.warn('[prix] circuit ouvert — scraping skippé');
  }

  // Étape 3 : fallback API officielle (Scryfall / PokéAPI / YGOPro)
  console.warn('[prix] fallback API...');
  const fallback = await fetchFallbackPrice(nameEn, game, language);
  console.warn('[prix] fallback résultat:', JSON.stringify(fallback));
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
