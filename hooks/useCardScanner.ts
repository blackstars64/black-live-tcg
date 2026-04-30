// ─── Hook principal scan carte ───────────────────────────────────
import { useScanStore } from '../store';

export function useCardScanner() {
  const { isScanning, currentResult, error, setScanning, setResult, setError, reset } =
    useScanStore();

  async function scanCard(imageUri: string): Promise<void> {
    setScanning(true);
    try {
      // TODO P1 : OCR → identification → prix
      setError('Scan non implémenté — P1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  return { isScanning, currentResult, error, scanCard, reset };
}
