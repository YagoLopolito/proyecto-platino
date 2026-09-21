"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { NAV_LINKS, isActiveLink } from "./nav-links";

/**
 * Barra de navegación inferior, sólo en mobile (`sm:hidden`).
 *
 * Reemplaza a la nav scrolleable horizontal del header: con la app instalada
 * en el celular no hay barra del navegador, y los tabs abajo quedan al alcance
 * del pulgar, que es lo que espera cualquiera que abra esto como una app.
 * En `sm` y más arriba desaparece y manda el header (`AppHeader`).
 */

/**
 * Los íconos salen del set (`components/ui/Icon`), que nació copiando la
 * métrica de los que antes vivían acá: ahora son los mismos paths, en un solo
 * lugar. Va por `href` y no por índice para que reordenar `NAV_LINKS` no
 * cambie los dibujos de lugar.
 */
const ICONS: Record<string, IconName> = {
  "/juegos": "gamepad",
  "/diario": "book",
  "/perfil": "user",
  "/configuracion": "settings",
};

export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones"
      data-testid="mobile-tab-bar"
      // `pb-safe` para que los tabs no queden bajo la barra de gestos del
      // iPhone, y `fixed` + el spacer del layout para que no tape contenido.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur sm:hidden"
    >
      <ul className="flex items-stretch">
        {NAV_LINKS.map((link) => {
          const active = isActiveLink(pathname, link);
          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                // min-h-14: por debajo de ~44px un target táctil se falla seguido.
                // El activo se distingue por el acento, el peso y la barra de
                // arriba: tres señales, no sólo el color (issue #176 §4).
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] leading-tight transition-colors ${
                  active
                    ? "font-semibold text-accent-ink before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:rounded-b before:bg-accent-ink"
                    : "font-medium text-ink-muted"
                }`}
              >
                <Icon name={ICONS[link.href] ?? "gamepad"} className="h-5 w-5" />
                <span className="truncate">{link.shortLabel ?? link.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
