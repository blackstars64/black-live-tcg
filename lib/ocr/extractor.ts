// ─── Extraction nom carte depuis texte OCR brut ──────────────────
import type { CardLanguage } from '../../types/card';

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

// Mots qui indiquent du texte de règles, pas un nom de carte
const RULES_START = /^(si|quand|chaque|lorsqu|tant que|lors|pendant|vous|votre|au début|à la|toute|celui|when|whenever|at the|if |each |you |your |all |any |as |choose|put |deals|target|until|search|reveal|draw|discard|destroy|exile|counter|add |pay |tap |untap|créature|enchant|instant|sorcier|planesw|artifact|land|terrain|sort|you may|gain|lose|gets?|becomes?|return)/i;

// Mots qui indiquent du texte parasite (impression, copyright, etc.)
const JUNK_PATTERN = /(\d{4}|™|©|wizards|pokemon|konami|illustrated|artist)/i;

function scoreLine(line: string): number {
  const words = line.trim().split(/\s+/);
  const wordCount = words.length;

  // Lignes trop courtes ou trop longues → pas un nom
  if (wordCount === 0 || wordCount > 6) return -10;

  let score = 0;

  // Longueur idéale pour un nom de carte : 1-4 mots
  if (wordCount <= 4) score += 3;
  else if (wordCount === 5) score += 1;

  // Commence par une majuscule → probable nom propre
  if (/^[A-ZÀ-ÜÉÈÊÎÔÛa-zà-ü]/.test(line) && /[A-ZÀ-ÜÉÈÊÎÔÛ]/.test(line[0])) score += 2;

  // Contient des chiffres → mana, PA/PD, numéro → pénalité
  if (/\d/.test(line)) score -= 4;

  // Ponctuation typique des règles → pénalité
  if (/[.,;:!?(){}]/.test(line)) score -= 3;

  // Commence par un mot de règles → pénalité forte
  if (RULES_START.test(line)) score -= 8;

  // Texte parasite (copyright, artiste, etc.) → exclusion
  if (JUNK_PATTERN.test(line)) score -= 10;

  return score;
}

/**
 * Extrait le nom de carte le plus probable depuis le texte OCR.
 * Le texte doit être pré-trié haut→bas (blocs ML Kit ordonnés par Y).
 * Utilise un système de score pour filtrer règles et texte parasite.
 */
export function extractCardName(rawText: string): string {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  if (lines.length === 0) return '';

  // Scorer chaque ligne et trier par score décroissant
  const scored = lines
    .map((line) => ({ line, score: scoreLine(line) }))
    .filter((s) => s.score > -5);

  if (scored.length === 0) return lines[0]; // dernier recours

  // Prendre la ligne avec le meilleur score
  // En cas d'égalité, privilégier celle qui apparaît en premier (plus haute sur la carte)
  scored.sort((a, b) => b.score - a.score || lines.indexOf(a.line) - lines.indexOf(b.line));

  return scored[0].line;
}

/**
 * Normalise le nom vers ASCII pour les requêtes API.
 * Conserve les accents pour Scryfall (fuzzy search gère les accents).
 */
export function normalizeCardName(name: string): string {
  return name
    .replace(/[^\w\s'\-àâäéèêëîïôùûüç]/gi, '')
    .trim();
}
