// ─── Matcher produit Cardmarket ──────────────────────────────────
// Trouve le meilleur résultat de recherche parmi les liens HTML
// en combinant nom, édition et numéro de carte.

// ─── Types ───────────────────────────────────────────────────────

export interface MatchResult {
  url: string;
  productName: string;
  score: number; // 0-1
  matchedBy: ('name' | 'set' | 'number')[];
}

// ─── Distance de Levenshtein ──────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : 1 + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]);
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
  return 1 - dist / Math.max(a.length, b.length, 1);
}

// ─── Scoring d'un candidat ────────────────────────────────────────

function computeScore(
  productName: string,
  url: string,
  targetName: string,
  targetSet?: string,
  targetNumber?: string
): { score: number; matchedBy: ('name' | 'set' | 'number')[] } {
  let score = 0;
  const matchedBy: ('name' | 'set' | 'number')[] = [];

  const nameLower = productName.toLowerCase();
  const targetLower = targetName.toLowerCase();
  const urlLower = url.toLowerCase();

  // ── Correspondance nom (0.6 max) ─────────────────────────────
  if (nameLower === targetLower) {
    score += 0.6;
    matchedBy.push('name');
  } else if (nameLower.includes(targetLower) || targetLower.includes(nameLower)) {
    score += 0.4;
    matchedBy.push('name');
  } else {
    const sim = similarity(targetName, productName);
    if (sim >= 0.6) {
      score += sim * 0.3; // max ~0.3 pour sim=1.0
      matchedBy.push('name');
    }
  }

  // ── Correspondance édition (0.3 max) ─────────────────────────
  if (targetSet) {
    const setLower = targetSet.toLowerCase().replace(/\s+/g, '-');
    if (urlLower.includes(setLower)) {
      score += 0.3;
      matchedBy.push('set');
    } else {
      // Similarité set via les segments de l'URL (ex: "/singles/core-set-2021/")
      const urlSegments = urlLower.split('/').join(' ');
      const setSim = similarity(targetSet, urlSegments);
      if (setSim >= 0.5) {
        score += 0.2;
        matchedBy.push('set');
      }
    }
  }

  // ── Correspondance numéro (0.1 max) ──────────────────────────
  if (targetNumber) {
    const numberClean = targetNumber.toLowerCase().replace(/^0+/, '');
    if (urlLower.includes(numberClean) || nameLower.includes(numberClean)) {
      score += 0.1;
      matchedBy.push('number');
    }
  }

  return { score: Math.min(score, 1), matchedBy };
}

// ─── Point d'entrée public ────────────────────────────────────────

/**
 * Sélectionne le meilleur produit Cardmarket parmi une liste de candidats.
 * Retourne null si aucun candidat n'atteint le score minimum de 0.4.
 */
export function findBestMatch(
  links: string[],
  productNames: string[],
  targetName: string,
  targetSet?: string,
  targetNumber?: string
): MatchResult | null {
  if (links.length === 0) return null;

  let best: MatchResult | null = null;

  for (let i = 0; i < links.length; i++) {
    const url = links[i];
    const productName = productNames[i] ?? '';

    const { score, matchedBy } = computeScore(
      productName,
      url,
      targetName,
      targetSet,
      targetNumber
    );

    if (score >= 0.4 && (best === null || score > best.score)) {
      best = { url, productName, score, matchedBy };
    }
  }

  return best;
}
