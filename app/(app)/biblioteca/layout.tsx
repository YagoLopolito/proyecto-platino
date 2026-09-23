import type { ReactNode } from "react";
import { SwipeTabs } from "@/components/ui/SwipeTabs";

/**
 * Biblioteca (epic #183): tus juegos, las reseñas de tus amigos y las listas.
 * Cada tab es una ruta (`/biblioteca`, `/biblioteca/resenas`,
 * `/biblioteca/listas`), no estado de React: ver `SwipeTabs`.
 */
const TABS = [
  { href: "/biblioteca", label: "Juegos" },
  { href: "/biblioteca/resenas", label: "Reseñas" },
  { href: "/biblioteca/listas", label: "Listas" },
];

export default function BibliotecaLayout({ children }: { children: ReactNode }) {
  return (
    <SwipeTabs tabs={TABS} label="Biblioteca">
      {children}
    </SwipeTabs>
  );
}
