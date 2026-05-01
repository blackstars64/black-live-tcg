// ─── Pipeline orchestrateur des prix ─────────────────────────────
// Priorité : cache local → backend proxy → scraping WebView → fallback API
import type { CardLanguage, GameType } from '../../types/card';
import { getCachedPrice, setCachedPrice, initPriceCache } from './cache';
import { fetchFallbackPrice } from './fallback';
import { enqueueRequest, isCircuitOpen, recordSuccess, recordFailure } from './ratelimit';
import { scrapePriceFromSearch, scrapePriceFromUrl } from './scraper';
import { fetchPriceFromProxy, isProxyConfigured } from './proxy';
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

  // Étape 2 : backend proxy Vercel (priorité si configuré)
  if (isProxyConfigured()) {
    const proxy = await fetchPriceFromProxy({ game, nameEn, language, setName, cardNumber });
    if (proxy.price !== null) {
      await setCachedPrice({
        cardId, language,
        priceNmLow: proxy.price,
        priceTrend: null,
        productUrl: proxy.productUrl,
        fetchedAt: Date.now(),
        source: 'cardmarket',
      });
      return {
        priceNmLow: proxy.price,
        priceTrend: null,
        language, condition: 'NM', currency: 'EUR',
        source: 'cardmarket',
        productUrl: proxy.productUrl,
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  // Étape 3 : scraping direct mobile (circuit breaker — bloqué par Cloudflare)
  if (!isCircuitOpen()) {
    try {
      const scraperResult = await enqueueRequest(() =>
        cachedProductUrl
          ? scrapePriceFromUrl(cachedProductUrl, language)
          : scrapePriceFromSearch(nameEn, game, language, setName, cardNumber)
      );

      if (scraperResult.priceNmLow !== null) {
        await setCachedPrice({
          cardId, language,
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
          language, condition: 'NM', currency: 'EUR',
          source: 'cardmarket',
          productUrl: scraperResult.productUrl,
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch {
      recordFailure();
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
