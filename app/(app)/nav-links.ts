/**
 * Navegación principal de la app autenticada. Compartida entre el header de
 * escritorio (`AppHeader`) y la barra inferior de mobile (`MobileTabBar`) para
 * que no se puedan desincronizar.
 */
export type NavLink = {
  href: string;
  label: string;
  /** Etiqueta corta para la barra inferior, donde entran ~7 caracteres. */
  shortLabel?: string;
  exact?: boolean;
};

export const NAV_LINKS: NavLink[] = [
  { href: "/juegos", label: "Biblioteca", shortLabel: "Juegos" },
  { href: "/diario", label: "Diario" },
  { href: "/perfil", label: "Perfil" },
  { href: "/configuracion", label: "Configuración", shortLabel: "Ajustes" },
];

/** Un link está activo también en sus subrutas (`/juegos/[id]`, etc.). */
export function isActiveLink(pathname: string, link: NavLink): boolean {
  return link.exact
    ? pathname === link.href
    : pathname === link.href || pathname.startsWith(`${link.href}/`);
}
