// ─── Client YGOPRODeck (Yu-Gi-Oh) ────────────────────────────────
// Docs      : https://ygoprodeck.com/api-guide/
// Auth      : aucune — gratuit, pas de rate limit documenté

// ─── Imports ─────────────────────────────────────────────────────
import type { Card, CardLanguage } from '../../types/card';

// ─── Constantes ──────────────────────────────────────────────────
const BASE_URL = 'https://db.ygoprodeck.com/api/v7';
const TIMEOUT_MS = 8_000;

// ─── Types réponse YGOPRODeck ─────────────────────────────────────
interface YgoCardRaw {
  id: number;
  name: string;
  type: string;
  card_sets?: Array<{
    set_name: string;
    set_code: string;
    set_number: string;
    set_rarity: string;
  }>;
  card_images?: Array<{
    id: number;
    image_url: string;
    image_url_small: string;
  }>;
}

interface YgoApiResponse {
  data: YgoCardRaw[];
}

// ─── Normalisation ─────────────────────────────────────────────────
function normalizeYgoCard(raw: YgoCardRaw, language: CardLanguage): Card {
  const primarySet = raw.card_sets?.[0];

  return {
    id: String(raw.id),
    name: raw.name,
    nameEn: raw.name,
    game: 'yugioh',
    set: primarySet?.set_name ?? '',
    setCode: primarySet?.set_code ?? '',
    number: primarySet?.set_number ?? '',
    language,
    imageUrl: raw.card_images?.[0]?.image_url ?? null,
    oracleId: null,
    cardmarketId: null,
  };
}

// ─── Fetch avec timeout ────────────────────────────────────────────
async function ygoFetch(endpoint: string): Promise<YgoCardRaw | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/${endpoint}`, {
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const json = (await response.json()) as YgoApiResponse;
    return json.data.length > 0 ? json.data[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Résolution FR→EN (6g) ────────────────────────────────────────
// Cherche par nom FR via language=fr → extrait l'id → refetch sans language pour le nom EN
async function resolveYgoFrToEn(nameFr: string): Promise<YgoCardRaw | null> {
  const encoded = encodeURIComponent(nameFr);

  // Piste 1 : nom exact FR
  const frExact = await ygoFetch(`cardinfo.php?name=${encoded}&language=fr`);
  if (frExact) {
    const enCard = await ygoFetch(`cardinfo.php?id=${frExact.id}`);
    if (enCard) return enCard;
  }

  // Piste 1b : recherche partielle FR
  const frFuzzy = await ygoFetch(`cardinfo.php?fname=${encoded}&language=fr`);
  if (frFuzzy) {
    const enCard = await ygoFetch(`cardinfo.php?id=${frFuzzy.id}`);
    if (enCard) return enCard;
  }

  return null;
}

// ─── Toutes les impressions d'une carte (6c) ──────────────────────
/**
 * Retourne toutes les éditions disponibles pour une carte YGO depuis son ID.
 * Les card_sets dans la réponse YGOPRODeck contiennent toutes les impressions.
 */
export async function getYgoPrintings(cardId: string): Promise<Card[]> {
  const raw = await ygoFetch(`cardinfo.php?id=${encodeURIComponent(cardId)}`);
  if (!raw?.card_sets) return [];

  return raw.card_sets.map((set) => ({
    id: `${raw.id}-${set.set_code}`,
    name: raw.name,
    nameEn: raw.name,
    game: 'yugioh' as const,
    set: set.set_name,
    setCode: set.set_code,
    number: set.set_number,
    language: 'en' as const,
    imageUrl: raw.card_images?.[0]?.image_url ?? null,
    oracleId: null,
    cardmarketId: null,
  }));
}

// ─── Point d'entrée public ────────────────────────────────────────
/**
 * Identifie une carte Yu-Gi-Oh depuis son nom OCR et sa langue détectée.
 * Stratégie :
 *   1. Recherche exacte par nom EN
 *   2. Recherche partielle (fname = fuzzy)
 *   3. Ordre des mots inversé — "Inclusion Christon" FR → "Christon Inclusion" EN (6a)
 *   4. Résolution FR→EN via language=fr + refetch par ID (6g)
 */
export async function identifyYgoCard(
  ocrName: string,
  language: CardLanguage
): Promise<Card | null> {
  const encodedName = encodeURIComponent(ocrName);

  // Étape 1 : recherche exacte par nom
  const exactResult = await ygoFetch(`cardinfo.php?name=${encodedName}`);
  if (exactResult) return normalizeYgoCard(exactResult, language);

  // Étape 2 : recherche partielle (fname = fuzzy name)
  const fuzzyResult = await ygoFetch(`cardinfo.php?fname=${encodedName}`);
  if (fuzzyResult) return normalizeYgoCard(fuzzyResult, language);

  // Étape 3 : ordre des mots inversé (6a)
  const words = ocrName.trim().split(/\s+/);
  if (words.length > 1) {
    const reversed = words.slice().reverse().join(' ');
    const reversedEncoded = encodeURIComponent(reversed);

    const reversedExact = await ygoFetch(`cardinfo.php?name=${reversedEncoded}`);
    if (reversedExact) return normalizeYgoCard(reversedExact, language);

    const reversedFuzzy = await ygoFetch(`cardinfo.php?fname=${reversedEncoded}`);
    if (reversedFuzzy) return normalizeYgoCard(reversedFuzzy, language);
  }

  // Étape 4 : résolution FR→EN via API language=fr (6g)
  if (language === 'fr' || language === 'de' || language === 'es' || language === 'it') {
    const enCard = await resolveYgoFrToEn(ocrName);
    if (enCard) return normalizeYgoCard(enCard, language);
  }

  return null;
}
