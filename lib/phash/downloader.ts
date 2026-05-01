// ─── Téléchargement de la base pHash ─────────────────────────────
// Télécharge phash.db depuis GitHub Releases au premier lancement.
// Lance initPHashMatcher() après téléchargement pour charger le cache.
import * as FileSystem from 'expo-file-system/legacy';

// URL configurable — pointer vers la release GitHub du projet
const PHASH_DB_URL =
  process.env.EXPO_PUBLIC_PHASH_DB_URL ??
  'https://github.com/blackstars64/black-live-tcg/releases/latest/download/phash.db';

export const PHASH_DB_PATH = `${FileSystem.documentDirectory}phash.db`;

// Taille minimale acceptable (5MB) — vérifie que le fichier n'est pas corrompu
const MIN_SIZE_BYTES = 5 * 1024 * 1024;

export async function getPHashDbPath(): Promise<string> {
  return PHASH_DB_PATH;
}

export async function isPHashDbReady(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(PHASH_DB_PATH);
    if (!info.exists) return false;
    // Vérification minimale : taille > 5MB
    const size = (info as FileSystem.FileInfo & { size?: number }).size ?? 0;
    return size >= MIN_SIZE_BYTES;
  } catch {
    return false;
  }
}

/**
 * Télécharge phash.db si absent ou corrompu.
 * @param onProgress  callback 0→1 pendant le téléchargement
 * @returns true si la DB est prête, false si le téléchargement a échoué
 */
export async function downloadPHashDb(
  onProgress?: (pct: number) => void
): Promise<boolean> {
  // Déjà là et valide → skip
  if (await isPHashDbReady()) {
    onProgress?.(1);
    return true;
  }

  try {
    onProgress?.(0);

    const downloadResumable = FileSystem.createDownloadResumable(
      PHASH_DB_URL,
      PHASH_DB_PATH,
      {},
      (progress: FileSystem.DownloadProgressData) => {
        if (progress.totalBytesExpectedToWrite > 0) {
          onProgress?.(
            progress.totalBytesWritten / progress.totalBytesExpectedToWrite
          );
        }
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result?.uri) throw new Error('Download returned no URI');

    // Vérification taille
    const info = await FileSystem.getInfoAsync(PHASH_DB_PATH);
    const size = (info as FileSystem.FileInfo & { size?: number }).size ?? 0;
    if (size < MIN_SIZE_BYTES) {
      await FileSystem.deleteAsync(PHASH_DB_PATH, { idempotent: true });
      console.warn(`[phash] DB trop petite (${size} bytes) — supprimée`);
      return false;
    }

    onProgress?.(1);
    console.log(`[phash] DB téléchargée — ${(size / 1024 / 1024).toFixed(1)} MB`);
    return true;
  } catch (err) {
    console.error('[phash] Téléchargement échoué :', err);
    await FileSystem.deleteAsync(PHASH_DB_PATH, { idempotent: true });
    return false;
  }
}
