// ─── Client Pokémon TCG API ──────────────────────────────────────
// Docs : https://pokemontcg.io/
import type { ApiResponse } from '../../types/api';
import type { Card } from '../../types/card';

const BASE_URL = 'https://api.pokemontcg.io/v2';

export async function searchCardByName(name: string): Promise<ApiResponse<Card>> {
  // TODO P5 : implémenter la recherche Pokémon TCG
  return { data: null, error: 'Not implemented', status: 501 };
}
