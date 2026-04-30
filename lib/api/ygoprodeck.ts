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

// ─── Point d'entrée public ────────────────────────────────────────
/**
 * Identifie une carte Yu-Gi-Oh depuis son nom OCR et sa langue détectée.
 * Stratégie : recherche exacte → recherche partielle (fname)
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

  return null;
}
