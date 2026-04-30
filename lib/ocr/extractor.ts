// ─── Extraction nom carte depuis texte OCR brut ──────────────────
// Logique : le nom est toujours en haut de la carte (première ligne non-vide)
export function extractCardName(rawText: string): string {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 2);

  // TODO P1 : affiner la détection (supprimer numéros, points de vie, etc.)
  return lines[0] ?? '';
}

export function normalizeCardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, '')
    .trim();
}
