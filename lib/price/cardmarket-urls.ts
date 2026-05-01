// ─── Construction d'URLs Cardmarket ───────────────────────────────
import type { GameType, CardLanguage } from '../../types/card';
import { CARDMARKET_LANGUAGE_ID } from '../../types/card';

const CM_BASE = 'https://www.cardmarket.com/fr';

const CM_GAME_PATH: Record<GameType, string> = {
  mtg: 'Magic',
  pokemon: 'Pokemon',
  yugioh: 'YuGiOh',
};

// Convertit un nom en slug Cardmarket : "Pot of Greed" → "Pot-of-Greed"
function toSlug(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // supprimer accents
    .replace(/[''`]/g, '')             // supprimer apostrophes
    .replace(/[^a-zA-Z0-9\s-]/g, '')  // supprimer caractères spéciaux
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * URL de recherche Cardmarket — toujours valide, moins précise.
 * Filtres : langue + condition NM.
 */
export function buildCmSearchUrl(
  game: GameType,
  nameEn: string,
  language: CardLanguage
): string {
  const langId = CARDMARKET_LANGUAGE_ID[language];
  return `${CM_BASE}/${CM_GAME_PATH[game]}/Products/Search?searchString=${encodeURIComponent(nameEn)}&language=${langId}&minCondition=2`;
}

/**
 * URL de produit direct — plus précise, peut 404 si le slug ne correspond pas.
 * Filtres : langue + condition NM.
 */
export function buildCmProductUrl(
  game: GameType,
  nameEn: string,
  setName: string,
  language: CardLanguage
): string {
  const langId = CARDMARKET_LANGUAGE_ID[language];
  const setSlug = toSlug(setName);
  const cardSlug = toSlug(nameEn);
  return `${CM_BASE}/${CM_GAME_PATH[game]}/Products/Singles/${setSlug}/${cardSlug}?language=${langId}&minCondition=2`;
}
