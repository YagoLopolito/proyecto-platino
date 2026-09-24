/**
 * Catálogo de las listas pregeneradas (epic #183, issue #192): título,
 * descripción y orden de cada una. Módulo puro, sin `server-only`: la base
 * guarda sólo el slug (`system_lists`), y el texto vive acá, en un solo lugar.
 */

/** Menos juegos que esto y la lista no se muestra (ni en la tab ni en su ficha). */
export const MIN_SYSTEM_LIST_ITEMS = 5;
/** Tope de juegos por lista pregenerada. */
export const MAX_SYSTEM_LIST_ITEMS = 50;

/** Las que se calculan en la base y refresca el cron: iguales para todos. */
export const GLOBAL_SYSTEM_LISTS = [
  "mejor-puntuados",
  "mas-jugados",
  "platinos-fin-de-semana",
  "maratones",
] as const;

/** Las que dependen de quién mira: se calculan al vuelo. */
export const PERSONAL_SYSTEM_LISTS = ["populares-entre-amigos", "tu-playlist-corta"] as const;

export type GlobalSystemListSlug = (typeof GLOBAL_SYSTEM_LISTS)[number];
export type PersonalSystemListSlug = (typeof PERSONAL_SYSTEM_LISTS)[number];

export interface SystemListMeta {
  slug: string;
  title: string;
  description: string;
  /** Si el orden es un ranking (se muestra el número sobre la carátula). */
  isRanked: boolean;
  personal: boolean;
  /** Orden en la tab: menor primero. */
  sortOrder: number;
}

const FIXED: Record<GlobalSystemListSlug | PersonalSystemListSlug, Omit<SystemListMeta, "slug">> = {
  "mejor-puntuados": {
    title: "Mejor puntuados en Platinoob",
    description: "El promedio de la comunidad, sólo con juegos que tienen al menos 3 valoraciones.",
    isRanked: true,
    personal: false,
    sortOrder: 10,
  },
  "populares-entre-amigos": {
    title: "Populares entre tus amigos",
    description: "Lo que más registró en su diario la gente que seguís.",
    isRanked: true,
    personal: true,
    sortOrder: 20,
  },
  "mas-jugados": {
    title: "Los más jugados en Platinoob",
    description: "Los juegos que más usuarios platinaron, completaron al 100% o reseñaron.",
    isRanked: true,
    personal: false,
    sortOrder: 30,
  },
  "platinos-fin-de-semana": {
    title: "Platinos para un fin de semana",
    description: "Juegos con platino que se completan en 15 horas o menos. El más corto primero.",
    isRanked: false,
    personal: false,
    sortOrder: 40,
  },
  maratones: {
    title: "Maratones: más de 100 h al platino",
    description: "Para cuando querés un juego que te dure meses. El más largo primero.",
    isRanked: false,
    personal: false,
    sortOrder: 50,
  },
  "tu-playlist-corta": {
    title: "Tu Playlist, la más corta primero",
    description: "Tu Playlist ordenada por lo que lleva pasarla: qué te da tiempo a jugar.",
    isRanked: false,
    personal: true,
    sortOrder: 60,
  },
};

const YEAR_SLUG = /^mejor-de-(\d{4})$/;

/** El slug de "Lo mejor de <año>". */
export function yearListSlug(year: number): string {
  return `mejor-de-${year}`;
}

/**
 * Título, descripción y orden de una lista pregenerada, o `null` si el slug
 * no es de ninguna (la ficha responde 404).
 */
export function systemListMeta(slug: string): SystemListMeta | null {
  if (slug in FIXED) return { slug, ...FIXED[slug as keyof typeof FIXED] };
  const year = YEAR_SLUG.exec(slug)?.[1];
  if (!year) return null;
  return {
    slug,
    title: `Lo mejor de ${year}`,
    description: `Los juegos de ${year} mejor puntuados en Platinoob.`,
    isRanked: true,
    personal: false,
    // Después de las fijas, el año más reciente primero.
    sortOrder: 1000 + (9999 - Number(year)),
  };
}

export function isPersonalSystemList(slug: string): slug is PersonalSystemListSlug {
  return (PERSONAL_SYSTEM_LISTS as readonly string[]).includes(slug);
}
