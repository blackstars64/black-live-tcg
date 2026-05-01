// ─── Client YGOPRODeck (Yu-Gi-Oh) ────────────────────────────────
// Docs      : https://ygoprodeck.com/api-guide/
// Auth      : aucune — gratuit, pas de rate limit documenté

// ─── Imports ─────────────────────────────────────────────────────
import type { Card, CardLanguage } from '../../types/card';

// ─── Constantes ──────────────────────────────────────────────────
const BASE_URL = 'https://db.ygoprodeck.com/api/v7';
const TIMEOUT_MS = 5_000;

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

// ─── Lookup direct YGO par passcode (identifiant universel) ──────
/**
 * Passcode 8 chiffres = identifiant unique par carte, indépendant de la langue/édition.
 * C'est le moyen le plus fiable pour identifier une carte YGO depuis l'OCR.
 */
export async function identifyYgoByPasscode(
  passcode: string,
  language: CardLanguage
): Promise<Card | null> {
  const result = await ygoFetch(`cardinfo.php?id=${encodeURIComponent(passcode)}`);
  if (result) return normalizeYgoCard(result, language);
  return null;
}

// ─── Lookup direct par numéro de set YGO ─────────────────────────
/**
 * Lookup par numéro de set (ex: "MAGO-EN002") via cardsetsinfo.php.
 * Si le numéro FR/DE/IT ne retourne rien → conversion vers EN.
 */
export async function identifyYgoByNumber(
  cardNumber: string,
  language: CardLanguage
): Promise<Card | null> {
  // cardsetsinfo.php retourne le set info + card_id → on refetch par id
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      `${BASE_URL}/cardsetsinfo.php?setcode=${encodeURIComponent(cardNumber)}`,
      { signal: controller.signal }
    );
    if (response.ok) {
      const json = await response.json() as { id?: number };
      if (json?.id) {
        const card = await ygoFetch(`cardinfo.php?id=${json.id}`);
        if (card) return normalizeYgoCard(card, language);
      }
    }
  } catch {
    // fallback
  } finally {
    clearTimeout(timer);
  }

  // Fallback : convertir FR/DE/IT → EN et réessayer
  const enNumber = cardNumber.replace(/-(?:FR|DE|ES|IT|PT|RU|KR|JA|ZH)(\d{3})$/, '-EN$1');
  if (enNumber !== cardNumber) {
    return identifyYgoByNumber(enNumber, language);
  }

  return null;
}

// ─── Résolution FR→EN (6g) ────────────────────────────────────────
// fname (fuzzy) + language=fr → id → refetch sans language pour le nom EN (2 appels max)
async function resolveYgoFrToEn(nameFr: string): Promise<YgoCardRaw | null> {
  const frResult = await ygoFetch(`cardinfo.php?fname=${encodeURIComponent(nameFr)}&language=fr`);
  if (!frResult) return null;
  return ygoFetch(`cardinfo.php?id=${frResult.id}`);
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
 *   3. Résolution langue→EN via fname+language param → refetch par ID (6g)
 */
export async function identifyYgoCard(
  ocrName: string,
  language: CardLanguage
): Promise<Card | null> {
  const encodedName = encodeURIComponent(ocrName);

  // Étape 1 : recherche exacte par nom EN
  const exactResult = await ygoFetch(`cardinfo.php?name=${encodedName}`);
  if (exactResult) return normalizeYgoCard(exactResult, language);

  // Étape 2 : recherche partielle EN (fname = fuzzy)
  const fuzzyResult = await ygoFetch(`cardinfo.php?fname=${encodedName}`);
  if (fuzzyResult) return normalizeYgoCard(fuzzyResult, language);

  // Étape 3 : résolution langue→EN via API language param (6g)
  if (language === 'fr' || language === 'de' || language === 'es' || language === 'it') {
    const enCard = await resolveYgoFrToEn(ocrName);
    if (enCard) return normalizeYgoCard(enCard, language);
  }

  return null;
}
