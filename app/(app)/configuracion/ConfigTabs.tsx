"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Tabs de Configuración. Client Component sólo para leer el `pathname` y
 * marcar el activo con `aria-current` (el layout es un Server Component y no
 * sabe en qué ruta está). Mismo tratamiento que la nav del header: versalitas,
 * acento y una regla debajo del activo, nunca sólo el color.
 */
export function ConfigTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Configuración" className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-11 items-center px-3 type-overline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink ${
              active
                ? "text-accent-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent-ink"
                : "font-medium text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
