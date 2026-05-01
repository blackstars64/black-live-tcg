// ─── Routeur d'identification universel ──────────────────────────
// Pipeline : identifiants directs (set+numéro) → nom → null

// ─── Imports ─────────────────────────────────────────────────────
import { identifyMtgCard, identifyMtgByNumber } from './scryfall';
import { identifyPokemonCard, identifyPokemonByNumber } from './pokemon-tcg';
import { identifyYgoCard, identifyYgoByNumber, identifyYgoByPasscode } from './ygoprodeck';
import type { Card, GameType, CardLanguage } from '../../types/card';
import type { CardIdentifiers } from '../ocr/extractor';

// ─── Types ───────────────────────────────────────────────────────
export interface IdentificationResult {
  card: Card;
  confidence: number;
  source: 'scryfall' | 'pokemon-tcg' | 'ygoprodeck';
  method: 'direct' | 'name'; // comment la carte a été trouvée
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
 * Ordre : lookup direct (set+numéro) → recherche par nom.
 * Le lookup direct est 100% fiable quand le numéro est lisible par l'OCR.
 */
export async function identifyCard(
  ocrName: string,
  game: GameType,
  language: CardLanguage,
  identifiers?: CardIdentifiers
): Promise<IdentificationResult | null> {
  // Étape 1 : lookup direct par identifiants (set+numéro)
  if (identifiers) {
    const direct = await identifyByIdentifiers(identifiers, game, language, ocrName);
    if (direct) return direct;
  }

  // Étape 2 : recherche par nom (fuzzy)
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
  identifiers?: CardIdentifiers
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

  const result = await identifyCard(ocrName, game, language, identifiers);
  if (result !== null) sessionCache.set(key, result);
  return result;
}
