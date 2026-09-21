import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Estado vacío con jerarquía: un ícono del set, el título, una línea de
 * contexto opcional y la acción primaria.
 *
 * Antes era un párrafo centrado dentro de un marco punteado, y cada pantalla
 * tenía su propia copia (`FriendsStrip`, `FavoriteGamesSection`, los dos
 * feeds de amigos...). Son las pantallas que más ve alguien que entra por
 * primera vez (issue #176 §4): tienen que decir qué falta y qué hacer, no
 * sólo que no hay nada.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Ícono del set. Sin él, el bloque es sólo texto (para huecos chicos). */
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-border px-4 py-8 text-center">
      {icon && (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised text-ink-faint">
          <Icon name={icon} className="h-5 w-5" />
        </span>
      )}
      <p className="max-w-md type-body text-ink-muted">{title}</p>
      {description && <p className="mt-1 max-w-md type-caption text-ink-faint">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
