// ─── Extraction nom carte depuis texte OCR brut ──────────────────
// Logique : le nom est toujours en haut de la carte (première ligne non-vide)
import type { CardLanguage } from '../../types/card';

// Plages Unicode pour détecter la langue du texte OCR
const JAPANESE_REGEX = /[　-鿿豈-﫿]/;
const KOREAN_REGEX = /[가-힯ᄀ-ᇿ]/;
const CHINESE_REGEX = /[一-鿿]/;
const CYRILLIC_REGEX = /[Ѐ-ӿ]/;

// Détection heuristique par présence de caractères diacritiques / mots clés FR/DE/ES
const FR_KEYWORDS = /\b(de|la|le|les|du|des|une|sur|avec|sans|pour)\b/i;
const DE_KEYWORDS = /\b(der|die|das|des|und|von|mit|für|nicht)\b/i;
const ES_KEYWORDS = /\b(del|las|los|una|con|sin|para|por|que)\b/i;
const PT_KEYWORDS = /\b(das|dos|uma|com|sem|para|por|que)\b/i;

/**
 * Détecte la langue de la carte depuis le texte OCR brut.
 * Priorité : systèmes d'écriture non-latin → diacritiques → langue par défaut EN.
 */
export function detectLanguage(rawText: string): CardLanguage {
  if (JAPANESE_REGEX.test(rawText)) return 'ja';
  if (KOREAN_REGEX.test(rawText)) return 'ko';
  if (CHINESE_REGEX.test(rawText)) return 'zh';
  if (CYRILLIC_REGEX.test(rawText)) return 'ru';

  // Détection langues latines par mots-outils caractéristiques
  if (FR_KEYWORDS.test(rawText)) return 'fr';
  if (DE_KEYWORDS.test(rawText)) return 'de';
  if (ES_KEYWORDS.test(rawText)) return 'es';
  if (PT_KEYWORDS.test(rawText)) return 'pt';

  // Fallback : anglais
  return 'en';
}

/**
 * Extrait le nom de la carte depuis le texte OCR.
 * Le nom est toujours sur la première ligne significative (zone haute de la carte).
 */
export function extractCardName(rawText: string): string {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    // Exclure les lignes qui ressemblent à du coût de mana, numéros, HP, etc.
    .filter((line) => line.length > 2 && !/^\d+[\s/]?\d*$/.test(line));

  // TODO P1 : affiner avec ML Kit text blocks (zone bounding box haute de carte)
  return lines[0] ?? '';
}

/**
 * Normalise le nom vers sa forme anglaise pour les requêtes API.
 * Supprime tous les caractères non-ASCII (accents, kana, etc.) après
 * que l'identification API aura retourné le nom EN officiel.
 */
export function normalizeCardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, '')
    .trim();
}
