// ─── Hook principal scan carte ───────────────────────────────────
// Compose useOcr + useScanStore + identifyCardCached + getCardPrice.
// Entrée : imageUri (photo prise par expo-camera)
// Sortie  : ScanResult complet dans le store (card identifiée + price + confidence)
import { useCallback } from 'react';

// ─── Hooks & store ────────────────────────────────────────────────
import { useOcr } from './useOcr';
import { useScanStore } from '../store';

// ─── Lib ──────────────────────────────────────────────────────────
import { extractCardName, normalizeCardName } from '../lib/ocr/extractor';
import { identifyCardCached } from '../lib/api/card-lookup';
import { getCardPrice } from '../lib/price';

// ─── Types ────────────────────────────────────────────────────────
import type { GameType } from '../types/card';

export function useCardScanner() {
  const { recognizeFromUri, isProcessing: isOcrProcessing, ocrError } = useOcr();
  const { isScanning, currentResult, error, setScanning, setResult, setError, reset } =
    useScanStore();

  /**
   * Pipeline complet : imageUri → OCR → identification API → prix NM Cardmarket
   * @param imageUri  URI de la photo capturée par expo-camera
   * @param game      Jeu sélectionné par l'utilisateur (mtg | pokemon | yugioh)
   */
  const scanCard = useCallback(
    async (imageUri: string, game: GameType): Promise<void> => {
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

        // Étape 3 : Identification via API (Scryfall / PokéAPI / YGOPRODeck)
        const identification = await identifyCardCached(rawName, game, ocr.language);

        const card = identification?.card ?? {
          // Fallback stub OCR — si aucune API ne répond
          id: `ocr-${Date.now()}`,
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

        // Confiance finale = OCR × identification (pénalité si stub)
        const finalConfidence = identification
          ? Math.min(ocr.confidence, identification.confidence)
          : ocr.confidence * 0.5;

        // Étape 4 : Prix NM — pipeline cache → scraping Cardmarket → fallback API
        // On passe set + number pour améliorer le matching Cardmarket
        const priceResult = await getCardPrice(
          card.id,
          card.nameEn,
          card.game,
          ocr.language,
          card.set,
          card.number
        );

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
          confidence: finalConfidence,
          scannedAt: new Date().toISOString(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setScanning(false);
      }
    },
    [recognizeFromUri, setScanning, setResult, setError]
  );

  // Recherche directe par nom saisi manuellement (bypass OCR)
  const scanByName = useCallback(
    async (name: string, game: GameType): Promise<void> => {
      setScanning(true);
      try {
        // Essayer FR d'abord (noms imprimés), puis EN en fallback
      const identification =
        (await identifyCardCached(name, game, 'fr')) ??
        (await identifyCardCached(name, game, 'en'));
        const card = identification?.card ?? {
          id: `manual-${Date.now()}`,
          name,
          nameEn: name,
          game,
          set: '',
          setCode: '',
          number: '',
          language: 'en' as const,
          imageUrl: null,
          oracleId: null,
          cardmarketId: null,
        };

        const priceResult = await getCardPrice(
          card.id,
          card.nameEn,
          card.game,
          card.language,
          card.set,
          card.number
        );

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
          confidence: identification ? identification.confidence : 0.5,
          scannedAt: new Date().toISOString(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setScanning(false);
      }
    },
    [setScanning, setResult, setError]
  );

  return {
    isScanning: isScanning || isOcrProcessing,
    currentResult,
    error: error ?? ocrError,
    scanCard,
    scanByName,
    reset,
  };
}
