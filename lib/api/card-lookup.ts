// ─── Routeur d'identification universel ──────────────────────────
// Dispatche vers le bon client API selon le jeu sélectionné.
// Fallback automatique sur les autres jeux si le principal échoue.
// Cache session en mémoire pour éviter les requêtes dupliquées.

// ─── Imports ─────────────────────────────────────────────────────
import { identifyMtgCard } from './scryfall';
import { identifyPokemonCard } from './pokemon-tcg';
import { identifyYgoCard } from './ygoprodeck';
import type { Card, GameType, CardLanguage } from '../../types/card';

// ─── Types ───────────────────────────────────────────────────────
export interface IdentificationResult {
  card: Card;
  confidence: number; // 0-1 — confiance sur l'identification (pas l'OCR)
  source: 'scryfall' | 'pokemon-tcg' | 'ygoprodeck';
}

// ─── Cache session ────────────────────────────────────────────────
// Évite de re-requêter la même carte pendant la même session app
const sessionCache = new Map<string, IdentificationResult | null>();

function cacheKey(name: string, game: GameType, lang: CardLanguage): string {
  return `${name.toLowerCase()}:${game}:${lang}`;
}

// ─── Mapping jeu → source ─────────────────────────────────────────
function gameToSource(game: GameType): 'scryfall' | 'pokemon-tcg' | 'ygoprodeck' {
  const map: Record<GameType, 'scryfall' | 'pokemon-tcg' | 'ygoprodeck'> = {
    mtg: 'scryfall',
    pokemon: 'pokemon-tcg',
    yugioh: 'ygoprodeck',
  };
  return map[game];
}

// ─── Identification principale ────────────────────────────────────
/**
 * Identifie une carte via l'API du jeu sélectionné.
 * Si le jeu principal échoue, essaie les autres (cas : mauvais jeu sélectionné).
 */
export async function identifyCard(
  ocrName: string,
  game: GameType,
  language: CardLanguage
): Promise<IdentificationResult | null> {
  const handlers: Record<GameType, () => Promise<Card | null>> = {
    mtg: () => identifyMtgCard(ocrName, language),
    pokemon: () => identifyPokemonCard(ocrName, language),
    yugioh: () => identifyYgoCard(ocrName, language),
  };

  // Tentative principale — jeu confirmé par l'utilisateur
  const card = await handlers[game]().catch(() => null);
  if (card) {
    return { card, confidence: 0.9, source: gameToSource(game) };
  }

  // Pas de fallback cross-jeu — l'utilisateur a sélectionné le jeu explicitement
  // Un fallback vers YGO/Pokémon sur une carte MTG retournerait de faux résultats
  return null;
}

// ─── Identification avec cache session ────────────────────────────
/**
 * Wrapper de identifyCard avec cache en mémoire (durée de vie = session app).
 * Utiliser cette fonction dans les hooks — jamais identifyCard directement.
 */
export async function identifyCardCached(
  ocrName: string,
  game: GameType,
  language: CardLanguage
): Promise<IdentificationResult | null> {
  const key = cacheKey(ocrName, game, language);
  if (sessionCache.has(key)) return sessionCache.get(key) ?? null;

  const result = await identifyCard(ocrName, game, language);
  sessionCache.set(key, result);
  return result;
}
