// ─── Identification de cartes TCG par Gemini Flash ────────────────
// Fallback quand pHash et numéro OCR échouent.
// Rate limit : 12 req/min (marge sous les 15 gratuits).
// Cache SQLite : même carte = 0 appel Gemini.

import { GoogleGenerativeAI } from '@google/generative-ai';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import type { Card, CardLanguage, GameType } from '../../types/card';

// ─── Config ───────────────────────────────────────────────────────

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const MODEL   = 'gemini-2.0-flash-lite';  // free tier sans billing (2.0-flash requiert billing)
const MAX_RPM = 12; // 12/min → marge sous les 15 gratuits

// ─── Rate limiter ─────────────────────────────────────────────────

const requestTimestamps: number[] = [];

function canMakeRequest(): boolean {
  const now = Date.now();
  // Purger les timestamps > 60s
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > 60_000) {
    requestTimestamps.shift();
  }
  return requestTimestamps.length < MAX_RPM;
}

function recordRequest(): void {
  requestTimestamps.push(Date.now());
}

function msUntilSlot(): number {
  if (canMakeRequest()) return 0;
  const oldest = requestTimestamps[0];
  return Math.max(0, 60_000 - (Date.now() - oldest) + 100);
}

// ─── Cache SQLite ─────────────────────────────────────────────────
// Stocke les résultats Gemini pour éviter de re-scanner la même carte.

const db = SQLite.openDatabaseSync('blacklivetcg.db');

db.execSync(`
  CREATE TABLE IF NOT EXISTS gemini_cache (
    image_hash TEXT PRIMARY KEY,
    result_json TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
`);

// Hash rapide de l'URI image (pas besoin de vrai hash perceptuel ici)
function uriHash(uri: string): string {
  let h = 0;
  for (let i = 0; i < uri.length; i++) {
    h = (Math.imul(31, h) + uri.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

async function getCached(imageUri: string): Promise<GeminiResult | null> {
  const key = uriHash(imageUri);
  const TTL = 7 * 24 * 60 * 60 * 1000; // 7 jours
  const row = db.getFirstSync<{ result_json: string; created_at: number }>(
    'SELECT result_json, created_at FROM gemini_cache WHERE image_hash = ?',
    [key]
  );
  if (!row || Date.now() - row.created_at > TTL) return null;
  try {
    return JSON.parse(row.result_json) as GeminiResult;
  } catch {
    return null;
  }
}

function setCached(imageUri: string, result: GeminiResult): void {
  const key = uriHash(imageUri);
  db.runSync(
    'INSERT OR REPLACE INTO gemini_cache (image_hash, result_json, created_at) VALUES (?, ?, ?)',
    [key, JSON.stringify(result), Date.now()]
  );
}

// ─── Types ────────────────────────────────────────────────────────

export interface GeminiResult {
  game: GameType;
  nameEn: string;
  namePrinted: string;   // nom dans la langue de la carte
  setName: string;
  setCode: string;
  number: string;
  rarity: string | null;
  language: CardLanguage;
  confidence: number;    // 0-1 estimé par Gemini
}

// ─── Prompt ───────────────────────────────────────────────────────

const PROMPT = `Tu es un expert en cartes à collectionner TCG. Identifie cette carte et retourne UNIQUEMENT un JSON valide, sans markdown, sans texte avant ou après.

Format strict :
{
  "game": "mtg" | "pokemon" | "yugioh",
  "nameEn": "nom anglais exact",
  "namePrinted": "nom imprimé sur la carte",
  "setName": "nom complet de l'édition",
  "setCode": "code court (ex: MOM, SVI, MAGO)",
  "number": "numéro de carte (ex: 247, 040/195, MAGO-EN002)",
  "rarity": "Common | Uncommon | Rare | Rare Holo | Ultra Rare | Secret Rare | Mythic Rare | null",
  "language": "en | fr | de | es | it | ja | ko | pt | ru | zh",
  "confidence": 0.0 à 1.0
}

Si tu n'es pas sûr d'un champ, mets null. Si tu ne reconnais pas la carte, retourne {"confidence": 0}.`;

// ─── Identification ───────────────────────────────────────────────

/**
 * Identifie une carte TCG depuis une photo.
 * Gère le rate limiting (12/min) et le cache SQLite.
 * @param imageUri  URI locale de la photo (expo-camera output)
 * @param game      Jeu sélectionné (optionnel — Gemini peut le détecter)
 */
export async function identifyCardWithGemini(
  imageUri: string,
  game?: GameType
): Promise<GeminiResult | null> {
  if (!API_KEY) {
    console.warn('[gemini] EXPO_PUBLIC_GEMINI_API_KEY non défini');
    return null;
  }

  // Cache hit
  const cached = await getCached(imageUri);
  if (cached) {
    console.log('[gemini] cache hit');
    return cached;
  }

  // Rate limit
  const wait = msUntilSlot();
  if (wait > 0) {
    console.warn(`[gemini] rate limit — attente ${wait}ms`);
    await new Promise<void>((r) => setTimeout(r, wait));
  }

  try {
    // Lire l'image en base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: 'base64',
    });

    // Détecter le type MIME depuis l'extension
    const ext = imageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    recordRequest();

    const genai = new GoogleGenerativeAI(API_KEY);
    const model = genai.getGenerativeModel({ model: MODEL });

    const promptWithGame = game
      ? `${PROMPT}\n\nJeu attendu : ${game} (mais vérifie sur la carte).`
      : PROMPT;

    const result = await model.generateContent([
      promptWithGame,
      { inlineData: { data: base64, mimeType } },
    ]);

    const text = result.response.text().trim();

    // Parser le JSON retourné
    const jsonStr = text.startsWith('{') ? text : text.match(/\{[\s\S]*\}/)?.[0] ?? '';
    const parsed = JSON.parse(jsonStr) as GeminiResult;

    if (!parsed.confidence || parsed.confidence < 0.3) {
      console.warn('[gemini] confiance trop faible:', parsed.confidence);
      return null;
    }

    // Valider les champs obligatoires
    if (!parsed.nameEn || !parsed.game) return null;

    setCached(imageUri, parsed);
    console.log(`[gemini] identifié: ${parsed.nameEn} (${parsed.game}) conf=${parsed.confidence}`);
    return parsed;
  } catch (err) {
    console.error('[gemini] erreur:', err);
    return null;
  }
}

/**
 * Convertit un GeminiResult en Card partielle pour l'app.
 */
export function geminiResultToCard(r: GeminiResult, imageUri?: string): Card {
  return {
    id: `gemini-${r.nameEn.toLowerCase().replace(/\s+/g, '-')}-${r.number}`,
    name: r.namePrinted || r.nameEn,
    nameEn: r.nameEn,
    game: r.game,
    set: r.setName,
    setCode: r.setCode,
    number: r.number,
    rarity: r.rarity,
    language: r.language,
    imageUrl: null, // chargé ensuite par l'API du jeu
    oracleId: null,
    cardmarketId: null,
  };
}

/**
 * Vérifie si Gemini peut traiter une requête maintenant (sans attendre).
 */
export function isGeminiAvailable(): boolean {
  return !!API_KEY && canMakeRequest();
}
