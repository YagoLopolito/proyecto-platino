import type { ReactNode } from "react";
import { SwipeTabs } from "@/components/ui/SwipeTabs";

/**
 * Actividad (epic #183): lo que hicieron tus amigos, lo que hiciste vos y lo
 * que recibiste. El contenido real llega con el sub-issue #195.
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
