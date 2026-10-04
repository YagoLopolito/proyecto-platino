"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RegisterLauncher } from "@/components/register/RegisterLauncher";
import { UnreadDot, formatUnread, useUnreadActivity } from "@/components/activity/UnreadActivity";
import { Icon } from "@/components/ui/Icon";
import { TAB_BAR_ITEMS, isActiveLink } from "./nav-links";

/**
 * Barra de navegación inferior, sólo en mobile (`sm:hidden`).
 *
 * Cinco botones, como la app de Letterboxd (epic #183, issue #185):
 * Biblioteca, Buscar, + (registrar), Actividad y Perfil. Sin texto visible:
 * con cinco destinos el texto no entra sin achicarse a nada, y los íconos del
 * set ya dicen qué es cada uno. El nombre accesible va en `aria-label`.
 *
 * El activo se marca con una píldora de `surface-hover` detrás del ícono y el
 * ícono en `accent-ink` -- dos señales, no sólo el color (WCAG 1.4.1) --,
 * además de `aria-current="page"`.
 *
 * En `sm` y más arriba desaparece y manda el header (`AppHeader`).
 */
export default function MobileTabBar() {
  const pathname = usePathname();
  const unreadActivity = useUnreadActivity();

  return (
    <nav
      aria-label="Secciones"
      data-testid="mobile-tab-bar"
      // `pb-safe` para que los tabs no queden bajo la barra de gestos del
      // iPhone, y `fixed` + el spacer del layout para que no tape contenido.
      // `chrome-raised` sólido (issue #184): la barra es chrome, no contenido.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-chrome-raised pb-safe sm:hidden"
    >
      <ul className="flex items-stretch">
        {TAB_BAR_ITEMS.map((item) => {
          if (item === "register") {
            return (
              <li key="register" className="flex-1">
                <RegisterLauncher variant="tab" />
              </li>
            );
          }
          const active = isActiveLink(pathname, item);
          const unread = item.href === "/actividad" ? unreadActivity : 0;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-label={
                  unread > 0 ? `${item.label}, ${formatUnread(unread)} sin leer` : item.label
                }
                aria-current={active ? "page" : undefined}
                // min-h-14: por debajo de ~44px un target táctil se falla seguido.
                className={`flex min-h-14 items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ink ${
                  active ? "text-accent-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                <span
                  className={`flex h-9 w-14 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-surface-hover" : ""
                  }`}
                >
                  <span className="relative">
                    <Icon name={item.icon} className="h-6 w-6" />
                    <UnreadDot count={unread} className="absolute -right-2.5 -top-1.5" />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
