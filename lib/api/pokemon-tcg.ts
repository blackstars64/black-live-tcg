// ─── Client Pokémon TCG API ───────────────────────────────────────
// Docs      : https://pokemontcg.io/
// Auth      : clé optionnelle (EXPO_PUBLIC_POKEMON_API_KEY)
// Rate limit: 1000 req/j sans clé, illimité avec clé

// ─── Imports ─────────────────────────────────────────────────────
import type { Card, CardLanguage } from '../../types/card';

// ─── Constantes ──────────────────────────────────────────────────
const BASE_URL = 'https://api.pokemontcg.io/v2';
const TIMEOUT_MS = 8_000;

// ─── Types réponse Pokémon TCG API ────────────────────────────────
interface PokemonCardRaw {
  id: string;
  name: string;
  set: { id: string; name: string; series: string };
  number: string;
  images: { small: string; large: string };
}

interface PokemonApiResponse {
  data: PokemonCardRaw[];
  totalCount: number;
}

// ─── Normalisation ─────────────────────────────────────────────────
function normalizePokemonCard(raw: PokemonCardRaw, language: CardLanguage): Card {
  return {
    id: raw.id,
    name: raw.name,
    nameEn: raw.name,
    game: 'pokemon',
    set: raw.set.name,
    setCode: raw.set.id.toUpperCase(),
    number: raw.number,
    language,
    imageUrl: raw.images.large,
    oracleId: null,
    cardmarketId: null,
  };
}

// ─── Fetch avec timeout ────────────────────────────────────────────
async function pokemonFetch(query: string): Promise<PokemonCardRaw | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const apiKey = process.env.EXPO_PUBLIC_POKEMON_API_KEY ?? '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers['X-Api-Key'] = apiKey;

  try {
    const url = `${BASE_URL}/cards?${query}&pageSize=5&orderBy=-set.releaseDate`;
    const response = await fetch(url, { headers, signal: controller.signal });

    if (!response.ok) return null;

    const json = (await response.json()) as PokemonApiResponse;
    return json.data.length > 0 ? json.data[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Point d'entrée public ────────────────────────────────────────
/**
 * Identifie une carte Pokémon depuis son nom OCR et sa langue détectée.
 * Stratégie : recherche exacte → recherche partielle (wildcard)
 */
export async function identifyPokemonCard(
  ocrName: string,
  language: CardLanguage
): Promise<Card | null> {
  // Étape 1 : recherche exacte (guillemets)
  const exactResult = await pokemonFetch(
    `q=name:"${encodeURIComponent(ocrName)}"`
  );
  if (exactResult) return normalizePokemonCard(exactResult, language);

  // Étape 2 : recherche partielle wildcard
  const partialResult = await pokemonFetch(
    `q=name:${encodeURIComponent(ocrName)}*`
  );
  if (partialResult) return normalizePokemonCard(partialResult, language);

  return null;
}
