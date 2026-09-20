"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, isActiveLink } from "./nav-links";

/**
 * Barra de navegación inferior, sólo en mobile (`sm:hidden`).
 *
 * Reemplaza a la nav scrolleable horizontal del header: con la app instalada
 * en el celular no hay barra del navegador, y los tabs abajo quedan al alcance
 * del pulgar, que es lo que espera cualquiera que abra esto como una app.
 * En `sm` y más arriba desaparece y manda el header (`AppHeader`).
 */
const ICONS: Record<string, React.ReactNode> = {
  "/juegos": (
    <path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm3 3v2H5v2h2v2h2v-2h2v-2H9V9H7Zm9 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm-2 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
  ),
  "/diario": (
    <path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 4v2h7V7H8Zm0 4v2h7v-2H8Zm0 4v2h4v-2H8Z" />
  ),
  "/perfil": (
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2.2-7 5v1h14v-1c0-2.8-3-5-7-5Z" />
  ),
  "/configuracion": (
    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-1.4-8h2.8l.4 2.3c.5.2 1 .4 1.4.7l2.1-1 1.4 2.4-1.7 1.5c0 .3.1.6.1.9s0 .6-.1.9l1.7 1.5-1.4 2.4-2.1-1c-.4.3-.9.5-1.4.7l-.4 2.3h-2.8l-.4-2.3c-.5-.2-1-.4-1.4-.7l-2.1 1-1.4-2.4 1.7-1.5a5.6 5.6 0 0 1 0-1.8L3.3 6.4l1.4-2.4 2.1 1c.4-.3.9-.5 1.4-.7L10.6 2Z" />
  ),
};

export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones"
      data-testid="mobile-tab-bar"
      // `pb-safe` para que los tabs no queden bajo la barra de gestos del
      // iPhone, y `fixed` + el spacer del layout para que no tape contenido.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 pb-safe backdrop-blur sm:hidden"
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
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] ${
                  active ? "text-accent-ink" : "text-zinc-400"
                }`}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                  {ICONS[link.href]}
                </svg>
                <span className="truncate">{link.shortLabel ?? link.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
