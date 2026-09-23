"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { logout } from "@/app/auth/actions";
import { RegisterLauncher } from "@/components/register/RegisterLauncher";
import { Icon } from "@/components/ui/Icon";
import { HEADER_LINKS, isActiveLink, sectionTitle, showsSettingsGear } from "./nav-links";

/** Logo de marca (`public/logo.webp`). `unoptimized` por la cuota de Vercel, igual que `GameArt`. */
function Logo({ className }: { className: string }) {
  return (
    <Link
      href="/biblioteca"
      aria-label="Platinoob"
      className="flex min-h-11 items-center rounded-chip focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
    >
      <Image
        src="/logo.webp"
        alt="Platinoob"
        width={900}
        height={153}
        priority
        unoptimized
        className={className}
      />
    </Link>
  );
}

/**
 * Buscador inline del header de escritorio. Enter lleva a `/buscar?q=`: es un
 * `<form method="get">` común, así que funciona sin JS. El popover de
 * búsquedas recientes llega con el sub-issue #194.
 */
function HeaderSearch() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  // En `/buscar` el campo arranca con la búsqueda actual, para poder
  // corregirla sin tipearla de nuevo.
  const current = pathname === "/buscar" ? (searchParams.get("q") ?? "") : "";

  return (
    <form action="/buscar" method="get" role="search" className="relative w-44 lg:w-56">
      <Icon
        name="search"
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
      />
      <input
        // `key`: si cambia la búsqueda actual, el campo no controlado se
        // vuelve a montar con el valor nuevo.
        key={current}
        type="search"
        name="q"
        defaultValue={current}
        placeholder="Buscar"
        aria-label="Buscar juegos, estudios, listas y usuarios"
        className="min-h-9 w-full rounded-chip border border-border-strong bg-surface pl-8 pr-2 type-meta text-ink transition-colors placeholder:text-ink-faint hover:border-ink-faint focus:border-accent-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 [&::-webkit-search-cancel-button]:hidden"
      />
    </form>
  );
}

/**
 * Avatar con menú (Perfil, Configuración, Salir). Estado propio y no un
 * `<details>`: tiene que cerrarse al hacer click afuera, con Escape y al
 * navegar, y `<details>` no hace ninguna de las tres.
 */
function AccountMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const rootRef = useRef<HTMLDivElement>(null);

  // Cerrar al navegar: se compara durante el render, no con un setState en un
  // effect (regla `react-hooks/set-state-in-effect`, ver CLAUDE.md).
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  // Click afuera y Escape: listeners del documento, o sea efecto imperativo.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const itemClass =
    "flex min-h-10 w-full items-center gap-2 rounded-chip px-3 type-meta text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Cuenta"
        onClick={() => setOpen((value) => !value)}
        // `rounded-full` porque es un avatar (la única excepción del radio).
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border-strong bg-surface text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
      >
        <Icon name="user" className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Cuenta"
          className="absolute right-0 top-full z-50 mt-2 w-52 rounded-card border border-border bg-surface-raised p-1"
        >
          <Link href="/perfil" role="menuitem" className={itemClass}>
            <Icon name="user" className="h-4 w-4" />
            Perfil
          </Link>
          <Link href="/configuracion" role="menuitem" className={itemClass}>
            <Icon name="settings" className="h-4 w-4" />
            Configuración
          </Link>
          <form action={logout}>
            <button type="submit" role="menuitem" className={`${itemClass} hover:text-danger`}>
              <Icon name="logout" className="h-4 w-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/**
 * Header de la app (epic #183, issue #185).
 *
 * - **Mobile**: una barra en `chrome` con el título de la sección en
 *   `type-title`, como Letterboxd: la navegación vive en la barra inferior, así
 *   que arriba sólo hace falta decir dónde estás. En el Perfil propio, el
 *   engranaje de Configuración a la izquierda (Configuración dejó de ser un
 *   tab). En las rutas que no son una sección (la ficha de un juego), el logo.
 * - **Escritorio (`sm`+)**: logo · nav en versalitas (Biblioteca, Actividad,
 *   Perfil) · buscador inline · "+ Registrar" · avatar con menú. El activo con
 *   las tres señales de #176: acento, peso y regla de 2px.
 *
 * No es `sticky`: la ficha de juego tiene su propia barra `sticky top-0` y las
 * dos se pisarían.
 */
export default function AppHeader() {
  const pathname = usePathname();
  const title = sectionTitle(pathname);
  const gear = showsSettingsGear(pathname);

  return (
    // `pt-safe` para despejar el notch (el viewport es `viewport-fit=cover`).
    <header className="border-b border-border bg-chrome pt-safe">
      {/* --- Mobile ---------------------------------------------------- */}
      <div className="flex min-h-14 items-center gap-2 px-4 py-2 sm:hidden">
        {gear && (
          <Link
            href="/configuracion"
            aria-label="Configuración"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-chip text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          >
            <Icon name="settings" className="h-5 w-5" />
          </Link>
        )}
        {title ? <p className="type-title text-ink">{title}</p> : <Logo className="h-6 w-auto" />}
      </div>

      {/* --- Escritorio ------------------------------------------------ */}
      {/*
       * `max-w-5xl`, el mismo ancho que las pantallas de listado: el logo
       * queda alineado con el contenido de abajo.
       */}
      <div className="mx-auto hidden w-full max-w-5xl items-center gap-4 px-4 py-3 sm:flex">
        <Logo className="h-7 w-auto" />

        <nav aria-label="Principal" className="mr-auto flex items-center gap-1">
          {HEADER_LINKS.map((link) => {
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

        {/* `useSearchParams` pide un límite de Suspense para no forzar a
            renderizar en el cliente todo lo que está arriba. */}
        <Suspense fallback={<div className="w-44 lg:w-56" />}>
          <HeaderSearch />
        </Suspense>
        <RegisterLauncher variant="header" />
        <AccountMenu />
      </div>
    </header>
  );
}
