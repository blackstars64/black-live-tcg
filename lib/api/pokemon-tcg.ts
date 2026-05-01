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

// ─── Helpers ──────────────────────────────────────────────────────

function buildHeaders(): Record<string, string> {
  const apiKey = process.env.EXPO_PUBLIC_POKEMON_API_KEY ?? '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-Api-Key'] = apiKey;
  return headers;
}

// Supprime les diacritiques pour les noms FR sans traduction complète (6f)
function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ─── Fetch avec timeout ────────────────────────────────────────────
async function pokemonFetch(query: string): Promise<PokemonCardRaw | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${BASE_URL}/cards?${query}&pageSize=5&orderBy=-set.releaseDate`;
    const response = await fetch(url, { headers: buildHeaders(), signal: controller.signal });

    if (!response.ok) return null;

    const json = (await response.json()) as PokemonApiResponse;
    return json.data.length > 0 ? json.data[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Retourne toutes les impressions pour un nom EN (utilisé par getPokemonPrintings)
async function pokemonFetchAll(query: string): Promise<PokemonCardRaw[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${BASE_URL}/cards?${query}&pageSize=100&orderBy=-set.releaseDate`;
    const response = await fetch(url, { headers: buildHeaders(), signal: controller.signal });

    if (!response.ok) return [];

    const json = (await response.json()) as PokemonApiResponse;
    return json.data;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ─── Toutes les impressions d'une carte (6c) ──────────────────────
/**
 * Retourne toutes les impressions d'une carte Pokémon depuis son nom EN.
 * PokéAPI ne supporte que les noms anglais.
 */
export async function getPokemonPrintings(nameEn: string): Promise<Card[]> {
  const results = await pokemonFetchAll(
    `q=name:"${encodeURIComponent(nameEn)}"`
  );
  return results.map((raw) => normalizePokemonCard(raw, 'en'));
}

// ─── Point d'entrée public ────────────────────────────────────────
/**
 * Identifie une carte Pokémon depuis son nom OCR et sa langue détectée.
 * Stratégie :
 *   1. Recherche exacte EN (guillemets)
 *   2. Recherche partielle wildcard EN
 *   3. Nom sans accents (6f — noms FR partiellement normalisés)
 *
 * Limitation : PokéAPI ne supporte pas les noms FR natifs (ex: "Dracaufeu" ≠ "Charizard").
 * Pour les cartes avec traduction complète, le nom EN doit être entré manuellement.
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

  // Étape 3 : sans accents — "Électhor" → "Electhor" (6f)
  if (language !== 'en') {
    const stripped = stripAccents(ocrName);
    if (stripped !== ocrName) {
      const strippedExact = await pokemonFetch(
        `q=name:"${encodeURIComponent(stripped)}"`
      );
      if (strippedExact) return normalizePokemonCard(strippedExact, language);

      const strippedPartial = await pokemonFetch(
        `q=name:${encodeURIComponent(stripped)}*`
      );
      if (strippedPartial) return normalizePokemonCard(strippedPartial, language);
    }
  }

  return null;
}
