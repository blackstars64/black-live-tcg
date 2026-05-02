// ─── Hook principal scan carte ───────────────────────────────────
// Compose useOcr + useScanStore + identifyCardCached + getCardPrice.
// Entrée : imageUri (photo prise par expo-camera)
// Sortie  : ScanResult complet dans le store (card identifiée + price + confidence)
import { useCallback } from 'react';

// ─── Hooks & store ────────────────────────────────────────────────
import { useOcr } from './useOcr';
import { useScanStore } from '../store';

// ─── Lib ──────────────────────────────────────────────────────────
import { extractOcrResult, normalizeCardName } from '../lib/ocr/extractor';
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
        // Étape 1 : OCR on-device via ML Kit (optionnel — pHash + Gemini n'en ont pas besoin)
        const ocr = await recognizeFromUri(imageUri);

        // Étape 2 : Extraction nom + identifiants depuis l'OCR (peut être vide si ML Kit échoue)
        const EMPTY_IDENTIFIERS = {
          ygoCardNumber: null, ygoPasscode: null,
          mtgSetCode: null, mtgCollectorNumber: null,
          pokemonNumber: null, pokemonTotal: null, pokemonSetCode: null,
        };
        const ocrResult = ocr
          ? extractOcrResult(ocr.text, game)
          : { name: '', identifiers: EMPTY_IDENTIFIERS };

        const rawName = ocrResult.name;
        const nameEn = normalizeCardName(rawName);
        const language = ocr?.language ?? 'fr';

        const hasIdentifiers =
          !!ocrResult.identifiers.ygoCardNumber ||
          !!(ocrResult.identifiers.mtgSetCode && ocrResult.identifiers.mtgCollectorNumber) ||
          !!ocrResult.identifiers.pokemonNumber;

        // Étape 3 : pHash → set+numéro → Gemini → nom
        // On passe toujours imageUri : pHash + Gemini identifient depuis l'image seule
        const identification = await identifyCardCached(
          rawName,
          game,
          language,
          ocrResult.identifiers,
          imageUri
        );

        // Si rien n'a fonctionné (pHash miss + Gemini miss + OCR vide) → erreur
        if (!identification && !nameEn && !hasIdentifiers) {
          setError('Carte non identifiée — repositionner ou saisir manuellement');
          return;
        }

        const card = identification?.card ?? {
          // Stub OCR — identification partielle (nom extrait mais API en échec)
          id: `ocr-${Date.now()}`,
          name: rawName,
          nameEn,
          game,
          set: '',
          setCode: '',
          number: '',
          rarity: null,
          language,
          imageUrl: null,
          oracleId: null,
          cardmarketId: null,
        };

        // Confiance finale = OCR × identification (pénalité si stub ou OCR absent)
        const ocrConfidence = ocr?.confidence ?? 0.5;
        const finalConfidence = identification
          ? Math.min(ocrConfidence, identification.confidence)
          : ocrConfidence * 0.5;

        // Étape 4 : Prix NM
        const priceResult = await getCardPrice(
          card.id,
          card.nameEn,
          card.game,
          language,
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
          rarity: null,
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
