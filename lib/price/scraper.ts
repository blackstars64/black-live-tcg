// ─── Scraper Cardmarket HTML ──────────────────────────────────────
// Récupère le prix NM minimum d'une carte via scraping HTML.
// Stratégie : recherche → matching → page produit filtrée NM + langue.
//
// Contraintes :
// - Rate limiting géré par le module parent (lib/price/ratelimit.ts)
// - Ce module n'appelle JAMAIS Cardmarket directement depuis le composant UI
// - Toujours utiliser l'entrée publique via lib/price/index.ts

// ─── Imports ─────────────────────────────────────────────────────
import type { GameType, CardLanguage } from '../../types/card';
import { CARDMARKET_LANGUAGE_ID } from '../../types/card';
import { findBestMatch } from './matcher';

// ─── Constantes ───────────────────────────────────────────────────

const CM_BASE = 'https://www.cardmarket.com';

const CM_GAME_PATH: Record<GameType, string> = {
  mtg: 'Magic',
  pokemon: 'Pokemon',
  yugioh: 'YuGiOh',
};

// Headers mobiles réalistes pour minimiser le risque de blocage
const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Cache-Control': 'no-cache',
};

// ─── Erreurs typées ───────────────────────────────────────────────

export class ScraperError extends Error {
  constructor(
    public readonly code: 'RATE_LIMITED' | 'BLOCKED' | 'PARSE_ERROR' | 'NOT_FOUND' | 'NETWORK',
    message: string
  ) {
    super(message);
    this.name = 'ScraperError';
  }
}

// ─── Types publics ────────────────────────────────────────────────

export interface ScraperResult {
  priceNmLow: number | null;
  priceTrend: number | null;
  productUrl: string | null;
  productName: string | null;
  source: 'cardmarket-scraper';
}

// ─── Regex de parsing HTML ────────────────────────────────────────

// Pattern 1 : JSON embarqué dans <script>
const JSON_PRICE_PATTERN = /"priceFrom"\s*:\s*"?([\d,\.]+)"?/;
const JSON_TREND_PATTERN = /"trendPrice"\s*:\s*"?([\d,\.]+)"?/;

// Pattern 2 : spans avec classes de prix Cardmarket
const PRICE_SPAN_PATTERN =
  /class="[^"]*color-primary[^"]*"[^>]*>\s*([\d]+[,\.][\d]+)\s*€/g;

// Pattern 3 : price-container
const PRICE_CONTAINER_PATTERN =
  /price-container[^>]*>[^<]*<[^>]+>([\d]+[,\.][\d]+)\s*€/;

// Pattern 4 : toutes les valeurs € dans la page (fallback large)
const ARTICLE_PRICE_PATTERN = /([\d]+[,\.][\d]+)\s*€/g;

// Pattern lien produit Singles
const PRODUCT_LINK_PATTERN =
  /href="(\/fr\/(?:Magic|Pokemon|YuGiOh)\/Products\/Singles\/[^"?#]+)"/g;

// Pattern nom produit extrait de la balise <a>
const PRODUCT_NAME_PATTERN =
  /href="(\/fr\/[^"]+\/Singles\/[^"?#]+)"[^>]*>([^<]{3,80})</g;

// ─── Helpers ──────────────────────────────────────────────────────

function parseCmPrice(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

/**
 * Calcule la médiane d'un tableau de nombres.
 * Utilisée pour filtrer les valeurs aberrantes (> 10x médiane).
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Détecte si le HTML correspond à un challenge Cloudflare ou page vide.
 */
function isCloudflareBlocked(html: string): boolean {
  return (
    html.includes('cf-browser-verification') ||
    html.includes('Just a moment...') ||
    html.includes('cf_chl_prog') ||
    html.length < 500
  );
}

/**
 * Extrait tous les prix € d'un bloc HTML en utilisant les patterns
 * dans l'ordre de fiabilité décroissante.
 */
function extractPrices(html: string): number[] {
  const prices: number[] = [];

  // Pattern 1 : JSON embarqué
  const jsonMatch = JSON_PRICE_PATTERN.exec(html);
  if (jsonMatch?.[1]) {
    prices.push(parseCmPrice(jsonMatch[1]));
  }

  // Pattern 2 : spans color-primary
  let match: RegExpExecArray | null;
  const spanRegex = new RegExp(PRICE_SPAN_PATTERN.source, 'g');
  while ((match = spanRegex.exec(html)) !== null) {
    prices.push(parseCmPrice(match[1]));
  }

  // Pattern 3 : price-container
  const containerMatch = PRICE_CONTAINER_PATTERN.exec(html);
  if (containerMatch?.[1]) {
    prices.push(parseCmPrice(containerMatch[1]));
  }

  // Pattern 4 : fallback large — toutes les valeurs €
  if (prices.length === 0) {
    const fallbackRegex = new RegExp(ARTICLE_PRICE_PATTERN.source, 'g');
    while ((match = fallbackRegex.exec(html)) !== null) {
      prices.push(parseCmPrice(match[1]));
    }
  }

  // Filtrer les valeurs aberrantes (> 10x la médiane)
  if (prices.length > 2) {
    const med = median(prices);
    return prices.filter((p) => p <= med * 10 && p > 0);
  }

  return prices.filter((p) => p > 0);
}

/**
 * Extrait le prix trend depuis le JSON embarqué.
 */
function extractTrendPrice(html: string): number | null {
  const match = JSON_TREND_PATTERN.exec(html);
  if (match?.[1]) return parseCmPrice(match[1]);
  return null;
}

/**
 * Extrait les paires (url, nom) des produits depuis le HTML de recherche.
 */
function extractProductLinks(html: string): { links: string[]; names: string[] } {
  const links: string[] = [];
  const names: string[] = [];
  const seen = new Set<string>();

  // Essai 1 : liens + noms ensemble
  const nameRegex = new RegExp(PRODUCT_NAME_PATTERN.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = nameRegex.exec(html)) !== null) {
    const url = match[1];
    const name = match[2].trim();
    if (!seen.has(url)) {
      seen.add(url);
      links.push(url);
      names.push(name);
    }
  }

  // Essai 2 : liens seuls si les noms n'ont pas été extraits
  if (links.length === 0) {
    const linkRegex = new RegExp(PRODUCT_LINK_PATTERN.source, 'g');
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      if (!seen.has(url)) {
        seen.add(url);
        links.push(url);
        names.push(''); // nom inconnu
      }
    }
  }

  return { links, names };
}

// ─── Fetch robuste ────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { headers: HEADERS });
  } catch (err) {
    throw new ScraperError('NETWORK', `Erreur réseau : ${String(err)}`);
  }

  if (response.status === 429) {
    throw new ScraperError('RATE_LIMITED', 'Cardmarket : trop de requêtes (429)');
  }

  if (response.status === 403) {
    throw new ScraperError('BLOCKED', 'Cardmarket : accès refusé (403)');
  }

  if (!response.ok) {
    throw new ScraperError('NETWORK', `HTTP ${response.status}`);
  }

  const html = await response.text();

  if (isCloudflareBlocked(html)) {
    throw new ScraperError('BLOCKED', 'Cardmarket : challenge Cloudflare détecté');
  }

  return html;
}

// ─── Points d'entrée publics ──────────────────────────────────────

/**
 * Scrape le prix NM minimum depuis une URL de produit Cardmarket connue.
 * Filtre par langue et condition NM (minCondition=2).
 */
export async function scrapePriceFromUrl(
  productUrl: string,
  language: CardLanguage
): Promise<ScraperResult> {
  const langId = CARDMARKET_LANGUAGE_ID[language];

  // Ajouter les filtres NM + langue à l'URL produit
  const separator = productUrl.includes('?') ? '&' : '?';
  const filteredUrl =
    `${CM_BASE}${productUrl}${separator}language=${langId}&minCondition=2`;

  const html = await fetchHtml(filteredUrl);
  const prices = extractPrices(html);
  const priceTrend = extractTrendPrice(html);

  return {
    priceNmLow: prices.length > 0 ? Math.min(...prices) : null,
    priceTrend,
    productUrl: filteredUrl,
    productName: null, // déjà connu par l'appelant
    source: 'cardmarket-scraper',
  };
}

/**
 * Recherche une carte sur Cardmarket, sélectionne le meilleur résultat
 * via le matcher, puis scrape le prix NM dans la langue cible.
 *
 * Lance ScraperError si bloqué ou si aucun résultat n'est trouvé.
 */
export async function scrapePriceFromSearch(
  nameEn: string,
  game: GameType,
  language: CardLanguage,
  setName?: string,
  cardNumber?: string
): Promise<ScraperResult> {
  const gamePath = CM_GAME_PATH[game];
  const searchUrl =
    `${CM_BASE}/fr/${gamePath}/Products/Search?searchString=${encodeURIComponent(nameEn)}`;

  const searchHtml = await fetchHtml(searchUrl);
  const { links, names } = extractProductLinks(searchHtml);

  if (links.length === 0) {
    throw new ScraperError('NOT_FOUND', `Aucun produit trouvé pour "${nameEn}"`);
  }

  const bestMatch = findBestMatch(links, names, nameEn, setName, cardNumber);

  if (!bestMatch) {
    throw new ScraperError(
      'NOT_FOUND',
      `Aucun match suffisant pour "${nameEn}" (score < 0.4)`
    );
  }

  const priceResult = await scrapePriceFromUrl(bestMatch.url, language);

  return {
    ...priceResult,
    productUrl: bestMatch.url,
    productName: bestMatch.productName,
  };
}
