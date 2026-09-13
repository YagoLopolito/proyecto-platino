import type { ReactNode } from "react";
import { FriendAvatar } from "@/components/friends/FriendAvatar";

/**
 * Encabezado del perfil (propio y de otro usuario): avatar grande sobre una
 * banda con degradado, el nombre, una línea de contexto y las acciones a la
 * derecha.
 *
 * La banda existe para que el perfil no arranque igual que cualquier otra
 * pantalla de listado: es la única de la app con una "portada", al estilo del
 * perfil de Letterboxd.
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
    <header className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <div
        className="h-20 bg-gradient-to-r from-blue-900/70 via-zinc-800 to-zinc-900 sm:h-24"
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-end justify-between gap-4 px-4 pb-4">
        <div className="-mt-8 flex min-w-0 items-end gap-3 sm:-mt-10 sm:gap-4">
          <div className="rounded-full ring-4 ring-zinc-900">
            <FriendAvatar url={avatarUrl} name={name} size={72} />
          </div>
          <div className="min-w-0 space-y-1 pb-1">
            <h1 className="truncate text-xl font-semibold sm:text-2xl">{name}</h1>
            {subtitle && <p className="truncate text-xs text-zinc-500 sm:text-sm">{subtitle}</p>}
            {badges && <div className="flex flex-wrap items-center gap-1.5 pt-0.5">{badges}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 pb-1">{actions}</div>}
      </div>
    </header>
  );
}

/** Chip de plataforma / estado, del tamaño de las versalitas de `SectionHeader`. */
export function ProfileBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-zinc-400">
      {children}
    </span>
  );
}
