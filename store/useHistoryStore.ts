// ─── Store historique des scans ──────────────────────────────────
import { create } from 'zustand';
import type { ScanResult } from '../types';

interface HistoryState {
  scans: ScanResult[];
  addScan: (result: ScanResult) => void;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  scans: [],
  addScan: (result) =>
    set((state) => ({ scans: [result, ...state.scans].slice(0, 100) })),
  clearHistory: () => set({ scans: [] }),
}));
