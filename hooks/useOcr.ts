// ─── Hook OCR ML Kit (on-device, gratuit, offline) ───────────────
import { useState, useCallback } from 'react';
import TextRecognition from '@react-native-ml-kit/text-recognition';

import { detectLanguage } from '../lib/ocr/extractor';
import type { CardLanguage } from '../types/card';

export interface OcrResult {
  text: string;         // Texte trié haut→bas (blocs ML Kit ordonnés par Y)
  fullText: string;     // Texte brut complet (ordre ML Kit)
  confidence: number;
  blockCount: number;
  language: CardLanguage;
}

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

      if (!result.text || result.text.trim().length === 0) return null;

      const blocks = result.blocks ?? [];
      const blockCount = blocks.length;

      // Trier les blocs par position Y croissante (haut de la carte = petit Y)
      // Le nom TCG est toujours dans le bloc le plus haut
      const sortedBlocks = [...blocks].sort(
        (a, b) => (a.frame?.top ?? 0) - (b.frame?.top ?? 0)
      );
      const sortedText = sortedBlocks.map((b) => b.text).join('\n');

      const confidence = blockCount >= 5 ? Math.min(blockCount / 8, 1) : blockCount > 0 ? 0.5 : 0.2;
      const language = detectLanguage(result.text);

      return {
        text: sortedText,      // utilisé pour extractCardName (trié)
        fullText: result.text, // utilisé pour detectLanguage
        confidence,
        blockCount,
        language,
      };
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : 'Erreur ML Kit inconnue');
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return { recognizeFromUri, isProcessing, ocrError };
}
