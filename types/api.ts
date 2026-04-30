// ─── Types réponses API ──────────────────────────────────────────
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

export interface ScryfallCard {
  id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  lang: string;
  image_uris?: { normal: string; small: string };
  card_faces?: Array<{ image_uris?: { normal: string; small: string } }>;
  oracle_id: string;
}

export interface PokemonCard {
  id: string;
  name: string;
  set: { id: string; name: string };
  number: string;
  images: { small: string; large: string };
}

export interface YgoCard {
  id: number;
  name: string;
  card_sets?: Array<{ set_name: string; set_code: string; set_number: string }>;
  card_images?: Array<{ image_url: string }>;
}
