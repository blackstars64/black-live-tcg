// ─── Hook OCR ML Kit (on-device, gratuit, offline) ───────────────
// Wrapper autour de @react-native-ml-kit/text-recognition.
// Retourne le texte brut + langue détectée + score de confiance approché.
import { useState, useCallback } from 'react';
import TextRecognition from '@react-native-ml-kit/text-recognition';

// ─── Imports locaux ───────────────────────────────────────────────
import { detectLanguage } from '../lib/ocr/extractor';
import type { CardLanguage } from '../types/card';

// ─── Types publics ────────────────────────────────────────────────
export interface OcrResult {
  text: string;        // Texte brut complet extrait par ML Kit
  confidence: number;  // 0-1 — approximation depuis le nombre de blocs détectés
  blockCount: number;  // Nombre de blocs texte retournés par ML Kit
  language: CardLanguage; // Langue détectée par heuristique Unicode/mots-outils
}

// ─── Hook ─────────────────────────────────────────────────────────
export function useOcr(): {
  recognizeFromUri: (imageUri: string) => Promise<OcrResult | null>;
  isProcessing: boolean;
  ocrError: string | null;
} {
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const recognizeFromUri = useCallback(async (imageUri: string): Promise<OcrResult | null> => {
    setIsProcessing(true);
    setOcrError(null);

    try {
      const result = await TextRecognition.recognize(imageUri);

      // Texte vide = carte non lisible (mauvais angle, reflet, etc.)
      if (!result.text || result.text.trim().length === 0) {
        return null;
      }

      const blockCount = result.blocks?.length ?? 0;

      // Approximation de confiance : 5 blocs ou plus = carte bien cadrée
      // Une carte TCG typique génère 3-8 blocs (nom, type, texte, PA/PD, numéro)
      const confidence = blockCount >= 5
        ? Math.min(blockCount / 8, 1)
        : blockCount > 0
          ? 0.5
          : 0.2;

      const language = detectLanguage(result.text);

      return {
        text: result.text,
        confidence,
        blockCount,
        language,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur ML Kit inconnue';
      setOcrError(message);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return { recognizeFromUri, isProcessing, ocrError };
}
