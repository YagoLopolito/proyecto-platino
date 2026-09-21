import type { ReactNode } from "react";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Encabezado del perfil (propio y de otro usuario): avatar grande sobre una
 * banda con degradado, el nombre, una línea de contexto y las acciones a la
 * derecha.
 *
 * La banda existe para que el perfil no arranque igual que cualquier otra
 * pantalla de listado: es la única de la app con una "portada", al estilo del
 * perfil de Letterboxd. El degradado sale del acento (`accent` → `surface`),
 * no de un azul de Tailwind elegido a ojo: es la misma tinta azulada que el resto
 * del tema, sólo que acá se deja ver.
 */
export function ProfileHeader({
  name,
  subtitle,
  avatarUrl,
  badges,
  actions,
}: {
  name: string;
  subtitle?: ReactNode;
  avatarUrl: string | null;
  /** Chips chicos debajo del nombre (plataformas conectadas, etc.). */
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="overflow-hidden rounded-card border border-border bg-surface">
      <div
        className="h-16 bg-gradient-to-r from-accent/50 via-accent/15 to-surface sm:h-28"
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-end justify-between gap-4 px-4 pb-4">
        <div className="-mt-8 flex min-w-0 items-end gap-3 sm:-mt-10 sm:gap-4">
          <div className="rounded-full ring-4 ring-surface">
            <FriendAvatar url={avatarUrl} name={name} size={64} />
          </div>
          <div className="min-w-0 space-y-1 pb-1">
            <h1 className="truncate type-title">{name}</h1>
            {/* El email no aporta nada en mobile (es el propio usuario el que
                mira) y se comía la línea del nombre: sólo desde `sm`. */}
            {subtitle && (
              <p className="hidden truncate type-meta text-ink-muted sm:block">{subtitle}</p>
            )}
            {badges && <div className="flex flex-wrap items-center gap-1.5 pt-0.5">{badges}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 pb-1">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * Chip de plataforma / estado, en las mismas versalitas que `SectionHeader`.
 * El ícono (gamepad para PSN, monitor para Steam) es opcional: el chip de
 * "sin plataformas" no lleva.
 */
export function ProfileBadge({ children, icon }: { children: ReactNode; icon?: IconName }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border-strong px-2 py-0.5 type-overline text-ink-muted">
      {icon && <Icon name={icon} className="h-3 w-3" />}
      {children}
    </span>
  );
}
