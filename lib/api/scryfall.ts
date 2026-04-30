// ─── Client Scryfall (Magic: The Gathering) ──────────────────────
// Docs : https://scryfall.com/docs/api
// Rate limit : 50-100ms entre requêtes, 10 req/s max
import type { ApiResponse } from '../../types/api';
import type { Card } from '../../types/card';

const BASE_URL = 'https://api.scryfall.com';
const RATE_LIMIT_MS = 100;

let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export async function searchCardByName(name: string): Promise<ApiResponse<Card>> {
  // TODO P2 : implémenter la recherche Scryfall
  await throttle();
  return { data: null, error: 'Not implemented', status: 501 };
}
