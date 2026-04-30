// ─── Hook principal scan carte ───────────────────────────────────
// Compose useOcr + useScanStore + getCardPrice.
// Entrée : imageUri (photo prise par expo-camera)
// Sortie  : ScanResult complet dans le store (card + price + confidence)
import { useCallback } from 'react';

// ─── Hooks & store ────────────────────────────────────────────────
import { useOcr } from './useOcr';
import { useScanStore } from '../store';

// ─── Lib ──────────────────────────────────────────────────────────
import { extractCardName, normalizeCardName } from '../lib/ocr/extractor';
import { getCardPrice } from '../lib/price';

// ─── Types ────────────────────────────────────────────────────────
import type { GameType } from '../types/card';

export function useCardScanner() {
  const { recognizeFromUri, isProcessing: isOcrProcessing, ocrError } = useOcr();
  const { isScanning, currentResult, error, setScanning, setResult, setError, reset } =
    useScanStore();

  /**
   * Pipeline complet : imageUri → OCR → extraction nom → prix NM Cardmarket
   * @param imageUri  URI de la photo capturée par expo-camera
   * @param game      Jeu détecté par l'utilisateur ou heuristique (mtg | pokemon | yugioh)
   */
  const scanCard = useCallback(async (imageUri: string, game: GameType): Promise<void> => {
    setScanning(true);
    try {
      // Étape 1 : OCR on-device via ML Kit
      const ocr = await recognizeFromUri(imageUri);
      if (!ocr) {
        setError('Aucun texte détecté — repositionner la carte');
        return;
      }

      // Étape 2 : Extraction nom depuis le texte brut OCR
      const rawName = extractCardName(ocr.text);
      const nameEn = normalizeCardName(rawName);
      if (!nameEn) {
        setError('Nom de carte non détecté — réessayer');
        return;
      }

      // Étape 3 : Construction stub card (P2 : identification API complète)
      const card = {
        id: `pending-${Date.now()}`,
        name: rawName,
        nameEn,
        game,
        set: '',
        setCode: '',
        number: '',
        language: ocr.language,
        imageUrl: null,
        oracleId: null,
        cardmarketId: null,
      };

      // Étape 4 : Prix NM — pipeline cache → scraping Cardmarket → fallback API
      const priceResult = await getCardPrice(card.id, nameEn, game, ocr.language);

      setResult({
        card,
        price: priceResult
          ? {
              cardId: card.id,
              language: priceResult.language,
              condition: priceResult.condition,
              priceNmLow: priceResult.priceNmLow,
              currency: priceResult.currency,
              fetchedAt: priceResult.fetchedAt,
              cardmarketUrl: priceResult.productUrl,
            }
          : null,
        confidence: ocr.confidence,
        scannedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setScanning(false);
    }
  }, [recognizeFromUri, setScanning, setResult, setError]);

  return {
    isScanning: isScanning || isOcrProcessing,
    currentResult,
    error: error ?? ocrError,
    scanCard,
    reset,
  };
}
