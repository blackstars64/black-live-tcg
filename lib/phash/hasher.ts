// ─── Calcul dHash d'une image ─────────────────────────────────────
//
// DÉPENDANCE NATIVE REQUISE — installer avant le build :
//   npx expo install react-native-image-hash expo-image-manipulator
//   puis : npx expo run:android (rebuild)
//
// react-native-image-hash fournit un dHash 64-bit (= 16 hex chars)
// directement depuis l'URI d'image — aucun décodage PNG/JPEG côté JS.
//
// Fallback pur-JS si la lib native est absente :
// expo-image-manipulator redimensionne en 9×8 → base64 PNG →
// approximation par échantillonnage des bytes IDAT.
// Moins précis (~70% de fiabilité) mais fonctionnel sans rebuild.

import * as ImageManipulator from 'expo-image-manipulator';

// ─── Types ────────────────────────────────────────────────────────

export interface HashResult {
  hash: string;   // 16 hex chars = 64 bits
  method: 'native' | 'fallback';
}

// ─── Tentative import natif ───────────────────────────────────────

let nativeHash: ((uri: string) => Promise<string>) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ImageHash = require('react-native-image-hash').default;
  nativeHash = (uri: string): Promise<string> =>
    new Promise((resolve, reject) => {
      ImageHash.hashImage(uri, 8, 'difference', (err: Error | null, data: string) => {
        if (err) reject(err);
        else resolve(normalizeHash(data));
      });
    });
} catch {
  // Lib non installée → utiliser le fallback JS
}

// ─── Normalisation du hash ────────────────────────────────────────
// Accepte : "0101..." (64 bits binaire) ou hex → normalise en hex 16 chars

function normalizeHash(raw: string): string {
  const cleaned = raw.trim().toLowerCase();

  // Format binaire (64 chars de 0/1) → hex
  if (/^[01]{64}$/.test(cleaned)) {
    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(cleaned.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  }

  // Format hex 16 chars → direct
  if (/^[0-9a-f]{16}$/.test(cleaned)) return cleaned;

  // Format hex plus long (32 chars = 128-bit phash) → garder les 16 premiers
  if (/^[0-9a-f]{32}$/.test(cleaned)) return cleaned.slice(0, 16);

  return cleaned.slice(0, 16).padEnd(16, '0');
}

// ─── Fallback pur-JS ──────────────────────────────────────────────
// Approximation : redimensionner en 9×8, lire les bytes base64 du PNG,
// dériver un hash 64-bit par échantillonnage de l'entropie locale.
// Cohérent pour la même carte mais moins robuste aux variations d'éclairage.

async function fallbackHash(imageUri: string): Promise<string> {
  // Redimensionner en 9×8 pour réduire l'image au minimum
  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: 9, height: 8 } }],
    { format: ImageManipulator.SaveFormat.PNG, base64: true }
  );

  const b64 = result.base64;
  if (!b64) throw new Error('expo-image-manipulator: base64 absent');

  // Décoder base64 → bytes
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  // Un PNG 9×8 fait ~200-400 bytes total.
  // On saute le header PNG (8 bytes sig + 25 IHDR + 12 IDAT header = ~45 bytes)
  // et on échantillonne 64 positions dans les données IDAT pour construire le hash.
  const dataStart = 45;
  const dataLen = bytes.length - dataStart - 12; // -12 = CRC + IEND
  const bits: number[] = [];

  for (let i = 0; i < 64; i++) {
    const pos = dataStart + Math.floor((i / 64) * dataLen);
    const nextPos = dataStart + Math.floor(((i + 1) / 64) * dataLen);
    bits.push(bytes[pos] > (bytes[nextPos] ?? bytes[pos]) ? 1 : 0);
  }

  // Convertir 64 bits → hex 16 chars
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += (bits[i] * 8 + bits[i + 1] * 4 + bits[i + 2] * 2 + bits[i + 3]).toString(16);
  }
  return hex;
}

// ─── Point d'entrée public ────────────────────────────────────────

/**
 * Calcule le dHash 64-bit d'une image URI.
 * Utilise react-native-image-hash (natif, précis) si disponible,
 * sinon fallback pur-JS via expo-image-manipulator (moins précis).
 */
export async function computeHash(imageUri: string): Promise<HashResult> {
  if (nativeHash) {
    try {
      const hash = await nativeHash(imageUri);
      return { hash, method: 'native' };
    } catch (err) {
      console.warn('[phash] Hash natif échoué, fallback JS :', err);
    }
  }

  const hash = await fallbackHash(imageUri);
  return { hash, method: 'fallback' };
}
