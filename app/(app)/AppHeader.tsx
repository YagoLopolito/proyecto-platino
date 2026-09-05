"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { NAV_LINKS, isActiveLink } from "./nav-links";

export default function AppHeader() {
  const pathname = usePathname();

  return (
    // `pt-safe` para despejar el notch (el viewport es `viewport-fit=cover`).
    // No es `sticky`: la ficha de juego tiene su propia barra `sticky top-0` y
    // las dos se pisarían. En mobile el acceso rápido lo da la barra inferior.
    <header className="border-b border-zinc-800 bg-zinc-950 pt-safe">
      {/*
       * En mobile el header es una sola fila (logo + cerrar sesión): la
       * navegación vive en la barra inferior (`MobileTabBar`), como en una app
       * nativa. A partir de `sm` la nav vuelve acá y la barra inferior
       * desaparece.
       */}
      <div className="mx-auto flex w-full max-w-4xl items-center gap-4 px-4 py-3">
        <Link
          href="/juegos"
          className="mr-auto flex min-h-11 items-center text-sm font-semibold tracking-wide text-zinc-50"
        >
          {/* "Platinoob": la "n" es compartida entre "Platino" y "noob", por
              eso el corte de color va en Platin|oob y no en Platino|noob. */}
          <span className="text-accent">Platin</span>
          <span className="text-accent-2">oob</span>
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-1 text-sm sm:flex">
          {NAV_LINKS.map((link) => {
            const active = isActiveLink(pathname, link);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded px-3 py-1.5 ${
                  active ? "bg-accent/10 text-accent" : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <form action={logout}>
          <button
            type="submit"
            className="min-h-11 whitespace-nowrap rounded border border-zinc-700 px-3 text-sm text-zinc-400 hover:border-red-500 hover:text-red-400 sm:min-h-0 sm:py-1.5"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
