import type { IconName } from "@/components/ui/Icon";

/**
 * Navegación principal de la app autenticada (epic #183, issue #185). Fuente
 * única para el header de escritorio (`AppHeader`) y la barra inferior de
 * mobile (`MobileTabBar`), para que no se puedan desincronizar.
 *
 * La estructura copia la de Letterboxd: tres gestos -- descubrir, registrar y
 * mostrar --, cada uno con su botón. En mobile son cinco (Biblioteca, Buscar,
 * +, Actividad, Perfil); en escritorio la búsqueda es un campo del header y el
 * + es el botón "Registrar", así que la nav de texto queda en tres.
 * Configuración dejó de ser un tab: vive en el engranaje del Perfil.
 */
export type NavLink = {
  href: string;
  label: string;
  icon: IconName;
  /** Otros prefijos que cuentan como esta sección (la ficha de juego es Biblioteca). */
  alsoActiveOn?: string[];
  /** Subrutas de un `alsoActiveOn` que son de otra sección (gana la excepción). */
  notActiveOn?: string[];
};

const BIBLIOTECA: NavLink = {
  href: "/biblioteca",
  label: "Biblioteca",
  icon: "library",
  // Las listas pregeneradas (#192) se descubren en Biblioteca › Listas.
  alsoActiveOn: ["/juegos", "/listas/sistema"],
};
const BUSCAR: NavLink = {
  href: "/buscar",
  label: "Buscar",
  icon: "search",
  // Los estudios (#193) se descubren desde la ficha y desde Buscar (#194).
  alsoActiveOn: ["/estudios"],
};
const ACTIVIDAD: NavLink = { href: "/actividad", label: "Actividad", icon: "bolt" };
const PERFIL: NavLink = {
  href: "/perfil",
  label: "Perfil",
  icon: "user",
  // El diario y el resumen del año son sub-secciones del perfil propio, y las
  // listas (#189) se arman y se ven desde Perfil › Listas.
  // La vitrina de platinos es la ampliación de "Platinos" de sus estadísticas.
  alsoActiveOn: ["/diario", "/configuracion", "/listas", "/vitrina"],
  notActiveOn: ["/listas/sistema"],
};

/** Nav de texto del header de escritorio. */
export const HEADER_LINKS: NavLink[] = [BIBLIOTECA, ACTIVIDAD, PERFIL];

/**
 * Barra inferior de mobile. `"register"` es el + del medio: un botón que abre
 * el sheet de registrar, no un link, así que no tiene `href`.
 */
export const TAB_BAR_ITEMS: (NavLink | "register")[] = [
  BIBLIOTECA,
  BUSCAR,
  "register",
  ACTIVIDAD,
  PERFIL,
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Un link está activo en su ruta, en sus subrutas y en las que declara como propias. */
export function isActiveLink(pathname: string, link: NavLink): boolean {
  if (link.notActiveOn?.some((prefix) => matchesPrefix(pathname, prefix))) return false;
  return [link.href, ...(link.alsoActiveOn ?? [])].some((prefix) =>
    matchesPrefix(pathname, prefix),
  );
}

/**
 * Título del header de mobile para la ruta actual. En mobile no hay logo
 * arriba: como en Letterboxd, la barra dice dónde estás. `null` en las rutas
 * que no son una sección (la ficha de un juego, que tiene su propio hero):
 * ahí el header muestra el logo.
 */
export function sectionTitle(pathname: string): string | null {
  if (matchesPrefix(pathname, "/configuracion")) return "Configuración";
  if (matchesPrefix(pathname, "/listas")) return "Listas";
  if (matchesPrefix(pathname, "/estudios")) return "Estudio";
  if (matchesPrefix(pathname, "/vitrina")) return "Vitrina";
  if (matchesPrefix(pathname, "/juegos")) return null;
  for (const link of [BIBLIOTECA, BUSCAR, ACTIVIDAD, PERFIL]) {
    if (isActiveLink(pathname, link)) return link.label;
  }
  return null;
}

/**
 * El engranaje de Configuración va a la izquierda del header, sólo en el
 * perfil PROPIO (`/perfil` y sus tabs), no en el de otro usuario.
 */
export function showsSettingsGear(pathname: string): boolean {
  return (
    pathname === "/perfil" ||
    ["/perfil/diario", "/perfil/listas", "/perfil/playlist", "/perfil/galeria"].some((p) =>
      matchesPrefix(pathname, p),
    )
  );
}
