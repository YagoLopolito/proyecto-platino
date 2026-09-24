import Link from "next/link";
import { getStudioPage } from "@/lib/studios/page-data";
import { resolveStudioGames } from "@/lib/studios/games";
import { STUDIO_GAME_ORDERS, parseStudioGameOrder, sortStudioGames } from "@/lib/studios/sort";
import { GamePoster } from "@/components/game/GamePoster";
import { PosterGrid } from "@/components/game/PosterGrid";
import { ListProgress } from "@/components/lists/ListGames";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/ui/Icon";

/**
 * Grilla de una tab del perfil de estudio (issue #193). Los juegos salen de
 * IGDB y se muestran aunque no estén en `games`: al tocarlos, la ruta
 * `/juegos/igdb/[id]` los materializa. El orden vive en `?orden=` (links, no
 * estado), igual que el resto de los filtros de la app.
 */
export async function StudioGames({
  slug,
  kind,
  orden,
}: {
  slug: string;
  kind: "developed" | "published";
  orden: string | undefined;
}) {
  const { supabase, userId, profile } = await getStudioPage(slug);
  if (profile === "unavailable") return null;

  const order = parseStudioGameOrder(orden);
  const source = kind === "developed" ? profile.developed : profile.published;
  const games = sortStudioGames(await resolveStudioGames(supabase, userId, source), order);
  const played = games.filter((game) => game.played).length;
  const path = `/estudios/${encodeURIComponent(profile.slug)}${kind === "published" ? "/publicados" : ""}`;

  if (games.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <EmptyState
          icon="gamepad"
          title={kind === "developed" ? "Sin juegos desarrollados" : "Sin juegos publicados"}
          description="IGDB no tiene juegos de este estudio en este rol."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ListProgress played={played} total={games.length} />
        <nav
          aria-label="Orden"
          className="inline-flex items-center rounded-card border border-border-strong bg-surface p-0.5"
        >
          {STUDIO_GAME_ORDERS.map(({ value, label }) => (
            <Link
              key={value}
              href={value === "anio" ? path : `${path}?orden=${value}`}
              aria-current={order === value ? "page" : undefined}
              className={`flex min-h-10 items-center rounded-chip px-3 type-caption font-medium transition-colors sm:min-h-9 ${
                order === value
                  ? "bg-accent/15 text-accent-ink shadow-[inset_0_0_0_1px_var(--color-accent-ink)]"
                  : "text-ink-muted hover:bg-surface-hover hover:text-ink"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <PosterGrid>
        {games.map((game) => (
          <li key={game.igdbId}>
            <GamePoster
              href={game.href}
              name={game.name}
              imageUrl={game.coverUrl}
              overlay={
                game.played ? (
                  // Tilde chico de "ya lo jugaste", como el ojo de Letterboxd.
                  // Esquina izquierda: la derecha es del badge de platino.
                  <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-success backdrop-blur-sm">
                    <Icon name="check" label="Jugado" className="h-3.5 w-3.5" />
                  </span>
                ) : undefined
              }
              caption={game.year !== null ? <span className="text-ink-faint">{game.year}</span> : undefined}
            />
          </li>
        ))}
      </PosterGrid>
    </div>
  );
}
