import type { ReactNode } from "react";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Encabezado del perfil (propio y de otro usuario).
 *
 * En mobile es la cabecera de Letterboxd (issue #196): avatar centrado, nombre
 * y bio debajo, sin marco ni banda -- el nombre de la sección ya está en el
 * header y la pantalla tiene que llegar rápido al Top 5. En escritorio conserva
 * la "portada": la banda con degradado del acento (`accent` → `surface`), que
 * con ancho de sobra es lo que hace que el perfil no arranque igual que
 * cualquier otra pantalla de listado.
 */
export function ProfileHeader({
  name,
  subtitle,
  bio,
  avatarUrl,
  badges,
  actions,
}: {
  name: string;
  subtitle?: ReactNode;
  /** Bio corta del usuario (`users.bio`, 160 caracteres). */
  bio?: string | null;
  avatarUrl: string | null;
  /** Chips chicos debajo del nombre (plataformas conectadas, etc.). */
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="sm:overflow-hidden sm:rounded-card sm:border sm:border-border sm:bg-surface">
      <div
        className="hidden h-28 bg-gradient-to-r from-accent/50 via-accent/15 to-surface sm:block"
        aria-hidden="true"
      />
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4 sm:px-4 sm:pb-4 sm:text-left">
        <div className="flex min-w-0 flex-col items-center gap-2 sm:-mt-10 sm:flex-row sm:items-end sm:gap-4">
          <div className="rounded-full sm:ring-4 sm:ring-surface">
            <FriendAvatar url={avatarUrl} name={name} size={72} />
          </div>
          <div className="min-w-0 space-y-1 pb-1">
            <h1 className="type-title sm:truncate">{name}</h1>
            {/* El email no aporta nada en mobile (es el propio usuario el que
                mira) y se comía la línea del nombre: sólo desde `sm`. */}
            {subtitle && (
              <p className="hidden truncate type-meta text-ink-muted sm:block">{subtitle}</p>
            )}
            {bio && (
              <p data-testid="profile-bio" className="max-w-md type-body text-ink-muted">
                {bio}
              </p>
            )}
            {badges && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-0.5 sm:justify-start">
                {badges}
              </div>
            )}
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
