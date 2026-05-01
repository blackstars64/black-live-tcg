// ─── Client prix — appel au backend proxy Vercel ─────────────────
// Remplace le scraping WebView et les fallback APIs inexacts.
// L'URL du backend est dans EXPO_PUBLIC_PRICE_API_URL.

import type { GameType, CardLanguage } from '../../types/card';

const BASE_URL = (process.env.EXPO_PUBLIC_PRICE_API_URL ?? '').replace(/\/$/, '');

export interface ProxyPriceResult {
  price: number | null;
  productUrl: string | null;
  source: 'cardmarket' | 'blocked' | 'not_found' | 'unavailable';
}

/**
 * Récupère le prix Cardmarket réel via le backend proxy.
 * Fallback silencieux si le backend n'est pas configuré.
 */
export async function fetchPriceFromProxy(params: {
  game: GameType;
  nameEn: string;
  language: CardLanguage;
  setName?: string;
  cardNumber?: string;
}): Promise<ProxyPriceResult> {
  if (!BASE_URL) {
    return { price: null, productUrl: null, source: 'unavailable' };
  }

  const query = new URLSearchParams({
    game: params.game,
    nameEn: params.nameEn,
    language: params.language,
    ...(params.setName ? { setName: params.setName } : {}),
    ...(params.cardNumber ? { cardNumber: params.cardNumber } : {}),
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    const res = await fetch(`${BASE_URL}/api/price?${query}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return { price: null, productUrl: null, source: 'unavailable' };

    const data = await res.json() as ProxyPriceResult;
    return data;
  } catch {
    return { price: null, productUrl: null, source: 'unavailable' };
  }
}

export function isProxyConfigured(): boolean {
  return !!BASE_URL;
}
