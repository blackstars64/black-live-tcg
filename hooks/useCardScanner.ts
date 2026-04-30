// ─── Hook principal scan carte ───────────────────────────────────
import { useScanStore } from '../store';
import { extractCardName, normalizeCardName, detectLanguage } from '../lib/ocr/extractor';
import { fetchCardPrice } from '../lib/api/cardmarket';
import type { CardLanguage, GameType } from '../types/card';

export function useCardScanner() {
  const { isScanning, currentResult, error, setScanning, setResult, setError, reset } =
    useScanStore();

  /**
   * Pipeline complet : OCR → identification → prix NM Cardmarket
   * @param rawOcrText  Texte brut retourné par ML Kit
   * @param game        Jeu détecté (mtg | pokemon | yugioh)
   */
  async function scanCard(rawOcrText: string, game: GameType): Promise<void> {
    setScanning(true);
    try {
      // Étape 1 : extraire le nom + détecter la langue depuis l'OCR
      const rawName = extractCardName(rawOcrText);
      const language = detectLanguage(rawOcrText);
      const nameEn = normalizeCardName(rawName);

      if (!nameEn) {
        setError('Nom de carte non détecté — réessayer');
        return;
      }

      // Étape 2 : TODO P2 — identification via API (Scryfall / PokéAPI / YGOPro)
      // Pour l'instant : stub card avec le nom extrait
      const card = {
        id: `pending-${Date.now()}`,
        name: rawName,
        nameEn,
        game,
        set: '',
        setCode: '',
        number: '',
        language,
        imageUrl: null,
        oracleId: null,
        cardmarketId: null,
      };

      // Étape 3 : prix NM Cardmarket (langue détectée au scan)
      const priceResponse = await fetchCardPrice(nameEn, game, language, null);

      setResult({
        card,
        price: priceResponse.data
          ? { ...priceResponse.data, cardId: card.id }
          : null,
        confidence: 0.7, // TODO P1 : lire confidence réelle depuis ML Kit
        scannedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  return { isScanning, currentResult, error, scanCard, reset };
}
