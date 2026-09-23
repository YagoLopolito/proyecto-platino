import type { ReactNode } from "react";
import { SwipeTabs } from "@/components/ui/SwipeTabs";

/**
 * Tabs del perfil PROPIO (epic #183). Van en el grupo `(propio)` y no en
 * `perfil/layout.tsx` para no aparecer en el perfil de otro usuario
 * (`/perfil/[id]`), que no tiene ni diario editable ni playlist propia.
 */
const TABS = [
  { href: "/perfil", label: "Perfil" },
  { href: "/perfil/diario", label: "Diario" },
  { href: "/perfil/listas", label: "Listas" },
  { href: "/perfil/playlist", label: "Playlist" },
];

export default function PerfilPropioLayout({ children }: { children: ReactNode }) {
  return (
    <SwipeTabs tabs={TABS} label="Perfil">
      {children}
    </SwipeTabs>
  );
}
