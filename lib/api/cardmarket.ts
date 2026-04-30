// ─── Client Cardmarket ───────────────────────────────────────────
// Docs    : https://api.cardmarket.com/ws/documentation
// Auth    : OAuth 1.0a — Dedicated App (4 tokens, pas d'OAuth dance)
// Secrets : EXPO_PUBLIC_CM_APP_TOKEN / APP_SECRET / ACCESS_TOKEN / ACCESS_SECRET
//           → à définir dans .env (usage perso, non distribué sur stores)
//
// Stratégie prix : articles filtrés minCondition=2 (NM+) + langue scannée
//                  → on prend le minimum des prix retournés
import OAuth from 'oauth-1.0a';
import CryptoJS from 'crypto-js';
import type { ApiResponse } from '../../types/api';
import type { CardPrice, CardLanguage, GameType } from '../../types/card';
import {
  CARDMARKET_LANGUAGE_ID,
  CARDMARKET_GAME_ID,
  CARDMARKET_CONDITION_NM,
} from '../../types/card';

// ─── Config ─────────────────────────────────────────────────────
const BASE_URL = 'https://api.cardmarket.com/ws/v2.0/output.json';

// Variables d'env (Expo — usage perso, non distribué)
const APP_TOKEN = process.env.EXPO_PUBLIC_CM_APP_TOKEN ?? '';
const APP_SECRET = process.env.EXPO_PUBLIC_CM_APP_SECRET ?? '';
const ACCESS_TOKEN = process.env.EXPO_PUBLIC_CM_ACCESS_TOKEN ?? '';
const ACCESS_SECRET = process.env.EXPO_PUBLIC_CM_ACCESS_SECRET ?? '';

// ─── OAuth 1.0a ─────────────────────────────────────────────────
function buildOAuth(): OAuth {
  return new OAuth({
    consumer: { key: APP_TOKEN, secret: APP_SECRET },
    signature_method: 'HMAC-SHA1',
    hash_function(baseString: string, key: string): string {
      return CryptoJS.HmacSHA1(baseString, key).toString(CryptoJS.enc.Base64);
    },
  });
}

function buildAuthHeader(method: string, url: string): string {
  const oauth = buildOAuth();
  const token = { key: ACCESS_TOKEN, secret: ACCESS_SECRET };
  const header = oauth.toHeader(oauth.authorize({ url, method }, token));
  return header.Authorization;
}

// ─── Requête authentifiée ─────────────────────────────────────────
async function cmFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
  const url = `${BASE_URL}${endpoint}${queryString}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: buildAuthHeader('GET', url),
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Cardmarket HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ─── Types réponse API Cardmarket ────────────────────────────────
interface CmProduct {
  idProduct: number;
  enName: string;
  locName: string;
  website: string;
}

interface CmProductsResponse {
  product?: CmProduct | CmProduct[];
}

interface CmArticle {
  idArticle: number;
  price: number;
  condition: string;
  language: { idLanguage: number; languageName: string };
  isFoil: boolean;
  isSigned: boolean;
  isAltered: boolean;
}

interface CmArticlesResponse {
  article?: CmArticle[];
}

// ─── Recherche produit par nom + jeu ─────────────────────────────
async function findProductId(nameEn: string, game: GameType): Promise<number | null> {
  const data = await cmFetch<CmProductsResponse>('/products/find', {
    search: nameEn,
    categoryId: String(CARDMARKET_GAME_ID[game]),
    maxResults: '10',
    exactMatch: 'false',
  });

  const products = data.product
    ? Array.isArray(data.product)
      ? data.product
      : [data.product]
    : [];

  // Priorité : correspondance exacte du nom EN (insensible à la casse)
  const exact = products.find(
    (p) => p.enName.toLowerCase() === nameEn.toLowerCase()
  );

  return exact?.idProduct ?? products[0]?.idProduct ?? null;
}

// ─── Fetch articles NM pour un produit + langue ───────────────────
async function fetchNmArticles(
  idProduct: number,
  language: CardLanguage
): Promise<CmArticle[]> {
  const langId = CARDMARKET_LANGUAGE_ID[language];

  const data = await cmFetch<CmArticlesResponse>(`/articles/${idProduct}`, {
    minCondition: String(CARDMARKET_CONDITION_NM),
    language: String(langId),
    start: '0',
    maxResults: '25',
  });

  return data.article ?? [];
}

// ─── Point d'entrée public ────────────────────────────────────────
/**
 * Retourne le prix NM minimum pour une carte dans la langue scannée.
 * Condition : NM (Near Mint) — jamais d'article abîmé.
 * Langue     : filtrée sur la langue détectée au scan (EN, FR, JP…).
 */
export async function fetchCardPrice(
  cardNameEn: string,
  game: GameType,
  language: CardLanguage,
  cachedProductId?: number | null
): Promise<ApiResponse<CardPrice & { cardId: string }>> {
  if (!APP_TOKEN || !ACCESS_TOKEN) {
    return {
      data: null,
      error: 'Cardmarket non configuré — ajouter les secrets dans .env',
      status: 401,
    };
  }

  try {
    // Réutilise l'idProduct mis en cache si disponible
    const idProduct = cachedProductId ?? (await findProductId(cardNameEn, game));

    if (!idProduct) {
      return { data: null, error: 'Carte introuvable sur Cardmarket', status: 404 };
    }

    const articles = await fetchNmArticles(idProduct, language);

    if (articles.length === 0) {
      return {
        data: null,
        error: `Aucun article NM disponible en ${language.toUpperCase()}`,
        status: 404,
      };
    }

    // Prix minimum parmi les articles NM de la langue cible
    // On exclut les cartes signées / altérées qui peuvent biaiser le prix
    const cleanArticles = articles.filter((a) => !a.isSigned && !a.isAltered);
    const priceList = cleanArticles.length > 0 ? cleanArticles : articles;
    const priceNmLow = Math.min(...priceList.map((a) => a.price));

    return {
      data: {
        cardId: String(idProduct),
        language,
        condition: 'NM',
        priceNmLow,
        currency: 'EUR',
        fetchedAt: new Date().toISOString(),
        cardmarketUrl: `https://www.cardmarket.com/fr/Magic/Products/Singles/-/-${idProduct}`,
      },
      error: null,
      status: 200,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Erreur Cardmarket inconnue',
      status: 500,
    };
  }
}
