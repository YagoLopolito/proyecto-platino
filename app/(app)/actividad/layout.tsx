import type { ReactNode } from "react";
import { SwipeTabs } from "@/components/ui/SwipeTabs";

/**
 * Actividad (epic #183): lo que hicieron tus amigos, lo que hiciste vos y lo
 * que recibiste. Cada tab es un log derivado (ver `lib/activity/`).
 */
const TABS = [
  { href: "/actividad", label: "Amigos" },
  { href: "/actividad/vos", label: "Vos" },
  { href: "/actividad/recibido", label: "Recibido" },
];

export default function ActividadLayout({ children }: { children: ReactNode }) {
  return (
    <SwipeTabs tabs={TABS} label="Actividad">
      {children}
    </SwipeTabs>
  );
}
