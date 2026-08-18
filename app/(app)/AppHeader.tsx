"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/auth/actions";

const NAV_LINKS = [
  { href: "/juegos", label: "Biblioteca" },
  { href: "/perfil", label: "Perfil" },
  { href: "/psn", label: "PSN" },
];

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/juegos" className="text-sm font-semibold tracking-wide text-zinc-50">
          Proyecto <span className="text-accent">Platino</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded px-3 py-1.5 ${
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-zinc-400 hover:text-zinc-100"
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
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:border-red-500 hover:text-red-400"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
