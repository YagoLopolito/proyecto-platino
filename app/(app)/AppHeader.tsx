"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/auth/actions";

const NAV_LINKS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/juegos", label: "Biblioteca" },
  { href: "/perfil", label: "Perfil" },
  { href: "/psn", label: "PSN" },
  // exact: /diario no debe quedar activo cuando estás en /diario/nuevo.
  { href: "/diario", label: "Diario", exact: true },
  { href: "/diario/nuevo", label: "✓ Marcar terminado" },
];

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      {/*
        * En mobile el header se parte en dos filas: arriba logo + "Cerrar sesión",
        * abajo la nav a lo ancho y scrolleable horizontalmente (son 5 links: en
        * pantallas angostas no entran en la misma fila sin desbordar la página).
        * A partir de `sm` vuelve a ser una sola fila.
        */}
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/juegos" className="mr-auto text-sm font-semibold tracking-wide text-zinc-50">
          <span className="text-accent">Platino</span>
          <span className="text-accent-2">noob</span>
        </Link>

        <nav
          aria-label="Principal"
          className="order-last -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0"
        >
          <div className="flex items-center gap-1 text-sm">
          {NAV_LINKS.map((link) => {
            const active = link.exact
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded px-3 py-1.5 ${
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          </div>
        </nav>

        <form action={logout}>
          <button
            type="submit"
            className="whitespace-nowrap rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:border-red-500 hover:text-red-400"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
