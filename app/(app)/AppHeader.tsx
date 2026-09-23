"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { Icon } from "@/components/ui/Icon";
import { NAV_LINKS, isActiveLink } from "./nav-links";

export default function AppHeader() {
  const pathname = usePathname();

  return (
    // `pt-safe` para despejar el notch (el viewport es `viewport-fit=cover`).
    // No es `sticky`: la ficha de juego tiene su propia barra `sticky top-0` y
    // las dos se pisarían. En mobile el acceso rápido lo da la barra inferior.
    <header className="border-b border-border bg-chrome pt-safe">
      {/*
       * En mobile el header es una sola fila (logo + cerrar sesión): la
       * navegación vive en la barra inferior (`MobileTabBar`), como en una app
       * nativa. A partir de `sm` la nav vuelve acá y la barra inferior
       * desaparece.
       *
       * `max-w-5xl`, el mismo ancho que las pantallas de listado: antes era
       * `max-w-4xl` y el logo quedaba corrido respecto del contenido de abajo.
       */}
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3">
        <Link
          href="/juegos"
          aria-label="Platinoob"
          className="mr-auto flex min-h-11 items-center rounded-chip focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        >
          {/* Logo de marca (`public/logo.webp`, con transparencia): reemplaza al
              "Platin|oob" tipeado. `unoptimized` por la misma razón que
              `GameArt`: la cuota de transformaciones de Vercel. */}
          <Image
            src="/logo.webp"
            alt="Platinoob"
            width={900}
            height={153}
            priority
            unoptimized
            className="h-6 w-auto sm:h-7"
          />
        </Link>

        {/*
         * Nav en versalitas (issue #176 §4): es chrome, no contenido, y con
         * `type-overline` ordena sin competir con las carátulas de abajo. El
         * activo se marca con el acento, el peso Y una regla debajo: no sólo
         * con color (WCAG 1.4.1).
         */}
        <nav aria-label="Principal" className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((link) => {
            const active = isActiveLink(pathname, link);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 items-center whitespace-nowrap rounded-chip px-3 type-overline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink ${
                  active
                    ? "text-accent-ink after:absolute after:inset-x-3 after:-bottom-3 after:h-0.5 after:bg-accent-ink"
                    : "font-medium text-ink-muted hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/*
         * En mobile el logout vive al final del perfil (que está a un tap en
         * la barra inferior): acá era el único botón del header y repetía lo
         * que ya ofrece esa pantalla. En escritorio se queda donde estaba.
         */}
        <form action={logout} className="hidden sm:block">
          <button
            type="submit"
            className="flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-chip px-2 type-meta text-ink-muted transition-colors hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          >
            <Icon name="logout" className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
