// ─── Extraction données OCR depuis texte brut ─────────────────────
// Pipeline : identifiers (set+numéro) en priorité → nom en fallback
import type { CardLanguage, GameType } from '../../types/card';

// ─── Détection langue ─────────────────────────────────────────────

const JAPANESE_REGEX = /[　-鿿豈-﫿]/;
const KOREAN_REGEX = /[가-힯ᄀ-ᇿ]/;
const CHINESE_REGEX = /[一-鿿]/;
const CYRILLIC_REGEX = /[Ѐ-ӿ]/;
const FR_KEYWORDS = /\b(de|la|le|les|du|des|une|sur|avec|sans|pour)\b/i;
const DE_KEYWORDS = /\b(der|die|das|des|und|von|mit|für|nicht)\b/i;
const ES_KEYWORDS = /\b(del|las|los|una|con|sin|para|por|que)\b/i;
const PT_KEYWORDS = /\b(das|dos|uma|com|sem|para|por|que)\b/i;

export function detectLanguage(rawText: string): CardLanguage {
  if (JAPANESE_REGEX.test(rawText)) return 'ja';
  if (KOREAN_REGEX.test(rawText)) return 'ko';
  if (CHINESE_REGEX.test(rawText)) return 'zh';
  if (CYRILLIC_REGEX.test(rawText)) return 'ru';
  if (FR_KEYWORDS.test(rawText)) return 'fr';
  if (DE_KEYWORDS.test(rawText)) return 'de';
  if (ES_KEYWORDS.test(rawText)) return 'es';
  if (PT_KEYWORDS.test(rawText)) return 'pt';
  return 'en';
}

// ─── Résultat OCR structuré ───────────────────────────────────────

export interface CardOcrResult {
  name: string;
  identifiers: CardIdentifiers;
}

export interface CardIdentifiers {
  // Yu-Gi-Oh : numéro de set "MAGO-EN002" OU passcode 8 chiffres "89631139"
  ygoCardNumber: string | null;
  ygoPasscode: string | null;
  // MTG : set code "MOM" + collector number "247"
  mtgSetCode: string | null;
  mtgCollectorNumber: string | null;
  // Pokémon : numéro "042" + total "091" + code set OCR "SVI" (optionnel)
  pokemonNumber: string | null;
  pokemonTotal: string | null;
  pokemonSetCode: string | null;
}

// ─── Patterns identifiants ────────────────────────────────────────

// YGO — Numéro de carte : MAGO-EN002 / DUNE-FR023 / RA03-DE012
const YGO_CARD_NUMBER = /\b([A-Z]{2,6})-([A-Z]{2})(\d{3})\b/;
// YGO — Passcode 8 chiffres (identifiant unique toutes langues, bottom left)
const YGO_PASSCODE = /(?<!\d)(\d{8})(?!\d)/;

// MTG : "MOM 247" ou "MOM 0247" ou "MOM 247/271 R" — set code + numéro
const MTG_SET_NUMBER = /\b([A-Z]{2,5})\s+0*(\d{1,4})(?:\/\d{1,4})?\b/;
// Fallback : fraction seule "247/271"
const MTG_COLLECTOR_ONLY = /\b(\d{1,4})\/(\d{1,4})\b/;

// Pokémon — Standard : "042/091" | Avec code set : "042/091 SVI" | TG : "TG12/TG30"
const POKEMON_WITH_SET = /\b(\d{1,3})\/(\d{2,3})\s+([A-Z]{2,5})\b/;
const POKEMON_NUMBER = /\b(\d{1,3})\/((?:\d{2,3}|TG\d{2}))\b|TG(\d{2})\/TG(\d{2})\b/;

// ─── Labels de type — jamais un nom de carte ──────────────────────

// Labels TCG communs FR+EN+DE+ES+IT — jamais un nom de carte
const TYPE_LABEL = /^(dresseur|supporter|objet|stade|énergie|energie|outil|trainer|item|stadium|energy|tool|monstre|magie|piège|piege|contre-piège|contre-piege|creature|créature|enchantement|enchantment|éphémère|ephemere|rituel|sorcery|instant|terrain|land|artefact|artifact|planeswalker|normale|effekt|spell|trap|monster|magic|field|continuous|quick-play|schnell-zauber|zauber|falle|krieger|monstro|magia|trampa|vmax|vstar|gx)$/i;

// Variants Pokémon standalone (graphique en haut de carte, pas le nom)
// "VSTAR" seul → bannière → pénalité forte
// "Givrali VSTAR" multi-mots → valide
const POKEMON_STANDALONE_VARIANT = /^(v|vmax|vstar|vunion|gx|ex|mega|tag\s+team|prism\s+star)$/i;

// Texte parasite (copyright, artiste, etc.)
const JUNK_PATTERN = /(\d{4}|™|©|wizards|nintendo|pokemon|konami|illustrated|artist)/i;

// Texte de règles
const RULES_START = /^(si|quand|chaque|lorsqu|tant que|lors|pendant|vous|votre|au début|à la|toute|celui|when|whenever|at the|if |each |you |your |all |any |as |choose|put |deals|target|until|search|reveal|draw|discard|destroy|exile|counter|add |pay |tap |untap|enchant|planesw|sort|you may|gain|lose|gets?|becomes?|return)/i;

// ─── Extraction des identifiants (set + numéro) ───────────────────

/**
 * Extrait les identifiants uniques de carte depuis le texte OCR brut.
 * Priorité sur le nom pour l'identification directe via API.
 */
export function extractCardIdentifiers(
  rawText: string,
  game: GameType
): CardIdentifiers {
  const result: CardIdentifiers = {
    ygoCardNumber: null,
    ygoPasscode: null,
    mtgSetCode: null,
    mtgCollectorNumber: null,
    pokemonNumber: null,
    pokemonTotal: null,
    pokemonSetCode: null,
  };

  if (game === 'yugioh') {
    const cardNumMatch = YGO_CARD_NUMBER.exec(rawText);
    if (cardNumMatch) {
      result.ygoCardNumber = `${cardNumMatch[1]}-${cardNumMatch[2]}${cardNumMatch[3]}`;
    }
    // Passcode 8 chiffres — identifiant universel (plus fiable que le numéro de set)
    const passcodeMatch = YGO_PASSCODE.exec(rawText);
    if (passcodeMatch) {
      result.ygoPasscode = passcodeMatch[1];
    }
  }

  if (game === 'mtg') {
    const matchFull = MTG_SET_NUMBER.exec(rawText);
    if (matchFull) {
      result.mtgSetCode = matchFull[1].toLowerCase();
      result.mtgCollectorNumber = matchFull[2];
    } else {
      const matchNum = MTG_COLLECTOR_ONLY.exec(rawText);
      if (matchNum) {
        result.mtgCollectorNumber = matchNum[1];
      }
    }
  }

  if (game === 'pokemon') {
    // Essai 1 : numéro + code set "042/091 SVI" (cartes modernes S&V)
    const withSet = POKEMON_WITH_SET.exec(rawText);
    if (withSet) {
      result.pokemonNumber = withSet[1].padStart(3, '0');
      result.pokemonTotal = withSet[2];
      result.pokemonSetCode = withSet[3];
    } else {
      // Essai 2 : numéro seul "042/091" ou TG
      const match = POKEMON_NUMBER.exec(rawText);
      if (match) {
        if (match[1] && match[2]) {
          result.pokemonNumber = match[1].padStart(3, '0');
          result.pokemonTotal = match[2];
        }
        if (match[3] && match[4]) {
          result.pokemonNumber = `TG${match[3]}`;
          result.pokemonTotal = `TG${match[4]}`;
        }
      }
    }
  }

  return result;
}

// ─── Scorer de ligne ──────────────────────────────────────────────

function scoreLine(line: string): number {
  const words = line.trim().split(/\s+/);
  const wordCount = words.length;

  if (wordCount === 0 || wordCount > 7) return -10;

  let score = 0;

  // Longueur idéale : 1-4 mots
  if (wordCount <= 4) score += 3;
  else if (wordCount <= 5) score += 1;

  // Commence par une majuscule
  if (/^[A-ZÀ-ÜÉÈÊÎÔÛa-zà-ü]/.test(line) && /[A-ZÀ-ÜÉÈÊÎÔÛ]/.test(line[0])) score += 2;

  // Contient des chiffres → numéro, PA/PD, mana
  if (/\d/.test(line)) score -= 4;

  // Ponctuation règles
  if (/[.,;:!?(){}]/.test(line)) score -= 3;

  // Texte de règles
  if (RULES_START.test(line)) score -= 8;

  // Copyright, artiste, etc.
  if (JUNK_PATTERN.test(line)) score -= 10;

  // Label de type TCG (Dresseur, Trainer, Monstre…)
  if (TYPE_LABEL.test(line.trim())) score -= 12;

  // Variant Pokémon standalone ("VSTAR", "VMAX" seul) → bannière, pas le nom
  if (POKEMON_STANDALONE_VARIANT.test(line.trim())) score -= 12;

  return score;
}

// ─── Déduplication des variants Pokémon en tête ───────────────────
// Cas OCR : "VSTAR Givrali VSTAR" → "Givrali VSTAR"
// L'OCR lit la bannière graphique + le vrai nom et les concatène.

function deduplicateLeadingVariant(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return name;

  const VARIANT = /^(vstar|vmax|vunion|gx|ex|mega|v)$/i;
  if (VARIANT.test(words[0])) {
    const rest = words.slice(1).join(' ');
    // Si le variant du début réapparaît dans le reste → doublon OCR
    if (new RegExp(`\\b${words[0]}\\b`, 'i').test(rest)) {
      return rest;
    }
  }
  return name;
}

// ─── Extraction du nom ────────────────────────────────────────────

/**
 * Extrait le nom de carte le plus probable depuis le texte OCR brut.
 * Texte pré-trié haut→bas (ML Kit ordonne par Y).
 */
export function extractCardName(rawText: string): string {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  if (lines.length === 0) return '';

  const scored = lines
    .map((line) => ({ line, score: scoreLine(line) }))
    .filter((s) => s.score > -5);

  if (scored.length === 0) return lines[0];

  scored.sort((a, b) => b.score - a.score || lines.indexOf(a.line) - lines.indexOf(b.line));

  return deduplicateLeadingVariant(scored[0].line);
}

/**
 * Résultat OCR complet : nom + identifiants (set+numéro).
 */
export function extractOcrResult(rawText: string, game: GameType): CardOcrResult {
  return {
    name: extractCardName(rawText),
    identifiers: extractCardIdentifiers(rawText, game),
  };
}

/**
 * Normalise le nom vers ASCII pour les requêtes API.
 */
export function normalizeCardName(name: string): string {
  return name
    .replace(/[^\w\s'\-àâäéèêëîïôùûüç]/gi, '')
    .trim();
}
