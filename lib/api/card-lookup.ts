// ─── Routeur d'identification universel ──────────────────────────
// Pipeline : pHash → set+numéro → Gemini → nom → null

// ─── Imports ─────────────────────────────────────────────────────
import { identifyMtgCard, identifyMtgByNumber } from './scryfall';
import { identifyPokemonCard, identifyPokemonByNumber } from './pokemon-tcg';
import { identifyYgoCard, identifyYgoByNumber, identifyYgoByPasscode } from './ygoprodeck';
import { findCardByHash, isPHashReady } from '../phash/matcher';
import { identifyCardWithGemini, geminiResultToCard, isGeminiAvailable } from '../ai/gemini-scanner';
import type { Card, GameType, CardLanguage } from '../../types/card';
import type { CardIdentifiers } from '../ocr/extractor';

// ─── Types ───────────────────────────────────────────────────────
export interface IdentificationResult {
  card: Card;
  confidence: number;
  source: 'scryfall' | 'pokemon-tcg' | 'ygoprodeck' | 'phash' | 'gemini';
  method: 'phash' | 'direct' | 'gemini' | 'name';
}

// ─── Cache session ────────────────────────────────────────────────
const sessionCache = new Map<string, IdentificationResult>();

function cacheKey(key: string, game: GameType, lang: CardLanguage): string {
  return `${key.toLowerCase()}:${game}:${lang}`;
}

function gameToSource(game: GameType): 'scryfall' | 'pokemon-tcg' | 'ygoprodeck' {
  const map: Record<GameType, 'scryfall' | 'pokemon-tcg' | 'ygoprodeck'> = {
    mtg: 'scryfall',
    pokemon: 'pokemon-tcg',
    yugioh: 'ygoprodeck',
  };
  return map[game];
}

// ─── Lookup direct par identifiants (set+numéro) ──────────────────
/**
 * Tente un lookup exact via les identifiants extraits de la carte.
 * Confiance 1.0 — le numéro de carte est unique dans son set.
 */
async function identifyByIdentifiers(
  identifiers: CardIdentifiers,
  game: GameType,
  language: CardLanguage,
  nameHint?: string
): Promise<IdentificationResult | null> {
  let card: Card | null = null;

  if (game === 'yugioh') {
    // Passcode en priorité (identifiant universel, 1 seul appel)
    if (identifiers.ygoPasscode) {
      card = await identifyYgoByPasscode(identifiers.ygoPasscode, language).catch(() => null);
    }
    // Fallback : numéro de set (ex: MAGO-EN002)
    if (!card && identifiers.ygoCardNumber) {
      card = await identifyYgoByNumber(identifiers.ygoCardNumber, language).catch(() => null);
    }
  }

  if (game === 'mtg' && identifiers.mtgSetCode && identifiers.mtgCollectorNumber) {
    card = await identifyMtgByNumber(
      identifiers.mtgSetCode,
      identifiers.mtgCollectorNumber,
      language
    ).catch(() => null);
  }

  if (game === 'pokemon' && identifiers.pokemonNumber) {
    card = await identifyPokemonByNumber(
      identifiers.pokemonNumber,
      identifiers.pokemonTotal,
      language,
      nameHint,
      identifiers.pokemonSetCode
    ).catch(() => null);
  }

  if (card) {
    return { card, confidence: 1.0, source: gameToSource(game), method: 'direct' };
  }
  return null;
}

// ─── Identification par nom ────────────────────────────────────────
async function identifyByName(
  ocrName: string,
  game: GameType,
  language: CardLanguage
): Promise<IdentificationResult | null> {
  const handlers: Record<GameType, () => Promise<Card | null>> = {
    mtg: () => identifyMtgCard(ocrName, language),
    pokemon: () => identifyPokemonCard(ocrName, language),
    yugioh: () => identifyYgoCard(ocrName, language),
  };

  const card = await handlers[game]().catch(() => null);
  if (card) {
    return { card, confidence: 0.85, source: gameToSource(game), method: 'name' };
  }
  return null;
}

// ─── Point d'entrée principal ─────────────────────────────────────
/**
 * Identifie une carte TCG.
 * Pipeline : pHash (offline) → set+numéro (direct) → Gemini (vision AI) → nom (fuzzy)
 */
export async function identifyCard(
  ocrName: string,
  game: GameType,
  language: CardLanguage,
  identifiers?: CardIdentifiers,
  imageUri?: string
): Promise<IdentificationResult | null> {
  // Étape 1 : pHash local (offline, ~50ms, si DB disponible)
  if (imageUri && isPHashReady()) {
    const phashMatch = await findCardByHash(imageUri, game).catch(() => null);
    if (phashMatch && phashMatch.confidence >= 0.85) {
      // Enrichir avec les données API complètes (image, set complet…)
      const apiResult = await identifyByIdentifiers(
        {
          ygoCardNumber: null, ygoPasscode: null,
          mtgSetCode: null, mtgCollectorNumber: null,
          pokemonNumber: phashMatch.number || null,
          pokemonTotal: null, pokemonSetCode: phashMatch.setCode || null,
        },
        phashMatch.game,
        language,
        phashMatch.nameEn
      );
      if (apiResult) return { ...apiResult, method: 'phash', source: 'phash' };

      // Fallback : utiliser les données pHash directement
      const card: Card = {
        id: phashMatch.cardId,
        name: phashMatch.nameEn,
        nameEn: phashMatch.nameEn,
        game: phashMatch.game,
        set: phashMatch.setName,
        setCode: phashMatch.setCode,
        number: phashMatch.number,
        rarity: phashMatch.rarity,
        language,
        imageUrl: phashMatch.imageUrl,
        oracleId: null,
        cardmarketId: null,
      };
      return { card, confidence: phashMatch.confidence, source: 'phash', method: 'phash' };
    }
  }

  // Étape 2 : lookup direct par set+numéro OCR
  if (identifiers) {
    const direct = await identifyByIdentifiers(identifiers, game, language, ocrName);
    if (direct) return direct;
  }

  // Étape 3 : Gemini Flash (si disponible et quota non épuisé)
  if (imageUri && isGeminiAvailable()) {
    const gemini = await identifyCardWithGemini(imageUri, game).catch(() => null);
    if (gemini && gemini.confidence >= 0.5) {
      // Enrichir via API pour avoir l'image haute qualité
      const apiResult = await identifyByName(gemini.nameEn, gemini.game, language).catch(() => null);
      if (apiResult) return { ...apiResult, method: 'gemini', source: 'gemini' };

      return {
        card: geminiResultToCard(gemini),
        confidence: gemini.confidence,
        source: 'gemini',
        method: 'gemini',
      };
    }
  }

  // Étape 4 : recherche par nom OCR (dernier recours)
  if (ocrName.length > 1) {
    return identifyByName(ocrName, game, language);
  }

  return null;
}

// ─── Avec cache session ───────────────────────────────────────────
export async function identifyCardCached(
  ocrName: string,
  game: GameType,
  language: CardLanguage,
  identifiers?: CardIdentifiers,
  imageUri?: string
): Promise<IdentificationResult | null> {
  // Clé de cache : numéro de carte si disponible, sinon nom
  const key = cacheKey(
    identifiers?.ygoPasscode
      ?? identifiers?.ygoCardNumber
      ?? identifiers?.pokemonNumber
      ?? (identifiers?.mtgSetCode && identifiers?.mtgCollectorNumber
        ? `${identifiers.mtgSetCode}-${identifiers.mtgCollectorNumber}`
        : ocrName),
    game,
    language
  );

  if (sessionCache.has(key)) return sessionCache.get(key)!;

  const result = await identifyCard(ocrName, game, language, identifiers, imageUri);
  if (result !== null) sessionCache.set(key, result);
  return result;
}
