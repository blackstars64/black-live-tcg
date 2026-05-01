// ─── Client Pokémon TCG API ───────────────────────────────────────
// Docs      : https://pokemontcg.io/
// Auth      : clé optionnelle (EXPO_PUBLIC_POKEMON_API_KEY)
// Rate limit: 1000 req/j sans clé, illimité avec clé

// ─── Imports ─────────────────────────────────────────────────────
import type { Card, CardLanguage } from '../../types/card';

// ─── Constantes ──────────────────────────────────────────────────
const BASE_URL = 'https://api.pokemontcg.io/v2';
const TIMEOUT_MS = 8_000;

// Mapping code OCR imprimé sur la carte → set.id API Pokémon TCG
// Code OCR = texte après le "/" dans "042/091 SVI" ou le ptcgoCode du set
const POKEMON_SET_CODE_MAP: Record<string, string> = {
  // Scarlet & Violet (sv*)
  SVI: 'sv1',    PAL: 'sv2',    OBF: 'sv3',    PAR: 'sv4',
  PAF: 'sv4pt5', TWM: 'sv6',    SCR: 'sv7',    SSP: 'sv8',
  PRE: 'sv8pt5', MEW: 'mew',    SFA: 'sv5',
  // Sword & Shield (swsh*)
  BST: 'swsh5',  CRE: 'swsh6',  EVS: 'swsh7',  FST: 'swsh8',
  BRS: 'swsh9',  ASR: 'swsh10', LOR: 'swsh11', SIT: 'swsh12',
  CRZ: 'swsh12pt5', PGO: 'pgo', CEL: 'cel25',
  // Sun & Moon (sm*)
  SUM: 'sm1',    GRI: 'sm2',    BUS: 'sm3',    CIN: 'sm35',
  UPR: 'sm5',    FLI: 'sm6',    CES: 'sm7',    LOT: 'sm8',
  TEU: 'sm9',    UNB: 'sm10',   UNM: 'sm11',   HIF: 'sm115',
  CEC: 'sm12',   SSH: 'swsh1',
};

// ─── Types réponse Pokémon TCG API ────────────────────────────────
interface PokemonCardRaw {
  id: string;
  name: string;
  set: { id: string; name: string; series: string };
  number: string;
  rarity?: string; // ex: "Common", "Rare Holo", "Ultra Rare", "Special Illustration Rare"
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
    rarity: raw.rarity ?? null,
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

// ─── Lookup direct par numéro de carte Pokémon ───────────────────
/**
 * Recherche Pokémon par numéro + set code (le plus direct) ou numéro+nom (fallback).
 * setCode : code OCR imprimé sur la carte (ex: "SVI" → "sv1" via mapping)
 */
export async function identifyPokemonByNumber(
  number: string,
  total: string | null,
  language: CardLanguage,
  nameHint?: string,
  setCode?: string | null
): Promise<Card | null> {
  // Étape 1 : set code connu → lookup direct setId+numéro (100% précis)
  if (setCode) {
    const setId = POKEMON_SET_CODE_MAP[setCode.toUpperCase()];
    if (setId) {
      // Essai via ID composé : "{setId}-{number}" (ex: "sv1-042")
      const directId = await pokemonFetch(`q=${encodeURIComponent(`number:${number} set.id:${setId}`)}`);
      if (directId) return normalizePokemonCard(directId, language);
    }
  }

  // Étape 2 : numéro + nom (si set inconnu mais nom disponible)
  if (nameHint && nameHint.length > 2) {
    const withName = await pokemonFetch(
      `q=${encodeURIComponent(`number:${number} name:${nameHint}`)}`
    );
    if (withName) return normalizePokemonCard(withName, language);
  }

  // Étape 3 : numéro seul → set le plus récent (orderBy=-set.releaseDate)
  const byNumber = await pokemonFetch(`q=${encodeURIComponent(`number:${number}`)}`);
  if (byNumber) return normalizePokemonCard(byNumber, language);

  return null;
}

// ─── Toutes les impressions d'une carte (6c) ──────────────────────
/**
 * Retourne toutes les impressions d'une carte Pokémon depuis son nom EN.
 * Stratégie : exact (guillemets) → partial (sans guillemets, filtré par nom exact)
 * Cela retourne toutes les raretés d'une même carte (common, holo, full art, rainbow…)
 */
export async function getPokemonPrintings(nameEn: string): Promise<Card[]> {
  if (!nameEn || nameEn.length < 2) return [];

  // Essai 1 : recherche exacte avec guillemets
  const exactResults = await pokemonFetchAll(
    `q=name:"${encodeURIComponent(nameEn)}"`
  );

  // Si l'exact retourne des résultats suffisants → utiliser
  if (exactResults.length >= 2) {
    console.log(`[pokemon] printings "${nameEn}" exact: ${exactResults.length}`);
    return exactResults.map((raw) => normalizePokemonCard(raw, 'en'));
  }

  // Essai 2 : recherche partielle sans guillemets (attrape plus de variantes)
  // Filtrage strict par nom exact côté app pour éviter les faux positifs
  const partialResults = await pokemonFetchAll(
    `q=name:${encodeURIComponent(nameEn)}`
  );
  const filtered = partialResults.filter(
    (raw) => raw.name.toLowerCase() === nameEn.toLowerCase()
  );

  console.log(`[pokemon] printings "${nameEn}" partial: ${partialResults.length} → filtered: ${filtered.length}`);

  // Fusionner exact + filtered, dédupliquer par id
  const seen = new Set<string>();
  const merged = [...exactResults, ...filtered].filter((raw) => {
    if (seen.has(raw.id)) return false;
    seen.add(raw.id);
    return true;
  });

  return merged.map((raw) => normalizePokemonCard(raw, 'en'));
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
