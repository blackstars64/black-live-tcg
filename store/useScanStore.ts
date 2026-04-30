// ─── Store scan en cours ─────────────────────────────────────────
import { create } from 'zustand';
import type { ScanResult } from '../types';

interface ScanState {
  isScanning: boolean;
  currentResult: ScanResult | null;
  error: string | null;
  setScanning: (value: boolean) => void;
  setResult: (result: ScanResult | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  isScanning: false,
  currentResult: null,
  error: null,
  setScanning: (value) => set({ isScanning: value }),
  setResult: (result) => set({ currentResult: result, error: null }),
  setError: (error) => set({ error, isScanning: false }),
  reset: () => set({ isScanning: false, currentResult: null, error: null }),
}));
