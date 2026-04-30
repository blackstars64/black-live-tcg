// ─── Client Cardmarket (prix) ────────────────────────────────────
// Docs : https://api.cardmarket.com/ws/documentation
// Auth : OAuth 1.0a — secrets dans MYSECRETS (BLACKLIVETCG_CARDMARKET_CLIENT_ID)
import type { ApiResponse } from '../../types/api';
import type { CardPrice } from '../../types/card';

export async function fetchCardPrice(
  cardNameEn: string,
  game: string
): Promise<ApiResponse<CardPrice>> {
  // TODO P4 : implémenter OAuth 1.0a + requête prix
  return { data: null, error: 'Not implemented', status: 501 };
}
