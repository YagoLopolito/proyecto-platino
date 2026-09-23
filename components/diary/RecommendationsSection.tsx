"use client";

import { GamePoster } from "@/components/game/GamePoster";
import { PosterRow, PosterRowItem } from "@/components/game/PosterGrid";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Icon } from "@/components/ui/Icon";
import { useActionState } from "react";
import {
  generateRecommendations,
  type RecommendationsActionState,
} from "@/app/(app)/diario/recommendation-actions";
import type { AiRecommendations } from "@/lib/ai";
import type { RecommendationGame } from "@/lib/diary/recommendations";

const initialState: RecommendationsActionState = { recommendations: null, error: null };

/**
 * Cuánto esfuerzo estima la IA que queda para platinar: color + etiqueta.
 *
 * Los tres salen de los tokens semánticos y no de tres verdes/ámbares/rojos
 * elegidos a ojo: "poco" es el mismo verde que un logro obtenido, "mucho" el
 * mismo rojo que un error.
 */
const EFFORT_STYLES: Record<string, { label: string; className: string }> = {
  poco: { label: "Poco", className: "border-success/50 bg-success/10 text-success" },
  medio: { label: "Medio", className: "border-warning/50 bg-warning/10 text-warning" },
  mucho: { label: "Mucho", className: "border-danger/50 bg-danger/10 text-danger" },
};

function EffortBadge({ effort }: { effort: string }) {
  const style = EFFORT_STYLES[effort] ?? EFFORT_STYLES.medio;
  return (
    <span
      className={`rounded-chip border px-1 py-0.5 type-overline ${style.className}`}
      title="Esfuerzo estimado por la IA para llegar al platino/100%"
    >
      {style.label}
    </span>
  );
}

/**
 * "Recomendados para vos": qué seguir jugando de la biblioteca propia y qué
 * juegos nuevos probar (de cualquier plataforma y época, no solo PSN),
 * inferido por IA a partir de lo que el usuario jugó en PSN, Steam y su diario:
 * platinos, horas y puntajes.
 *
 * El listado se renderiza siempre desde las props (lo que trajo el server con
 * la última generación `ok` guardada): la Server Action hace `revalidatePath`,
 * así que al terminar vuelven a bajar ya resueltas con carátula y progreso.
 * El estado local se usa solo para el error y el pending del botón.
 *
 * Vive en Biblioteca › Juegos (epic #183, issue #191; antes estaba en el
 * diario), plegada a lo que entra en una pantalla de navegar: "Seguí jugando"
 * es un carrusel de pósters, no una grilla, y "Para probar" son tarjetas de
 * texto. Arriba lleva la misma `SectionHeader` que las demás secciones de la
 * biblioteca, con el botón de generar como acción.
 */
export default function RecommendationsSection({
  recommendations,
  games,
  generatedAt,
}: {
  recommendations: AiRecommendations | null;
  games: RecommendationGame[];
  generatedAt: string | null;
}) {
  const [state, formAction, pending] = useActionState<RecommendationsActionState, FormData>(
    generateRecommendations,
    initialState,
  );

  const gamesById = new Map(games.map((game) => [game.id, game]));
  const keepPlaying = (recommendations?.seguir_jugando ?? []).filter((item) =>
    gamesById.has(item.juego_id),
  );
  const fresh = recommendations?.nuevos ?? [];

  return (
    <section aria-labelledby="recomendados-heading" className="space-y-3">
      <SectionHeader
        title={
          <span id="recomendados-heading" className="flex items-center gap-1.5">
            <Icon name="sparkle" className="h-3.5 w-3.5 text-accent-ink" />
            Recomendados para vos
          </span>
        }
        action={
          <form action={formAction}>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 items-center font-semibold text-accent-ink transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
            >
              {pending
                ? "Generando..."
                : recommendations
                  ? "Actualizar recomendaciones"
                  : "Recomendame algo"}
            </button>
          </form>
        }
        description="Qué seguir jugando y qué probar, según lo que jugaste en PSN, Steam y tu diario. Contenido generado por IA: puede tener errores."
      />

      {state.error && (
        <p
          role="alert"
          className="rounded-card border border-danger/50 bg-danger/10 p-3 type-body text-danger"
        >
          {state.error}
        </p>
      )}

      {!recommendations ? (
        <p className="type-body text-ink-muted">
          Todavía no generaste recomendaciones. Dale a &quot;Recomendame algo&quot; y la IA arma una
          lista tomando como referencia lo que jugaste, platinaste y puntuaste.
        </p>
      ) : (
        <div className="space-y-5">
          <p className="type-review text-ink-muted">{recommendations.perfil}</p>

          {keepPlaying.length > 0 && (
            <div className="space-y-2">
              <h3 className="type-meta font-semibold text-ink-muted">Seguí jugando</h3>
              <PosterRow>
                {keepPlaying.map((item) => {
                  const game = gamesById.get(item.juego_id)!;
                  return (
                    <PosterRowItem key={item.juego_id}>
                      <GamePoster
                        href={`/juegos/${game.id}`}
                        name={game.name}
                        imageUrl={game.imageUrl}
                        progress={game.total > 0 ? game : null}
                        showName
                        overlay={
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/85 px-1.5 py-1">
                            <span className="type-caption tabular-nums text-ink-muted">
                              {game.percent}%
                            </span>
                            <EffortBadge effort={item.esfuerzo} />
                          </div>
                        }
                        caption={<span className="line-clamp-3">{item.motivo}</span>}
                        sizes="(max-width: 640px) 26vw, 170px"
                      />
                    </PosterRowItem>
                  );
                })}
              </PosterRow>
            </div>
          )}

          {fresh.length > 0 && (
            <div className="space-y-2">
              <h3 className="type-meta font-semibold text-ink-muted">Para probar</h3>
              {/*
               * Estos juegos no están en la base (por definición: el usuario no
               * los tiene), así que no hay carátula ni ficha adónde linkear --
               * van como tarjetas de texto y no como grilla de portadas.
               */}
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {fresh.map((item, i) => (
                  <li
                    key={`${item.nombre}-${i}`}
                    className="rounded-card border border-border bg-surface p-3"
                  >
                    <p className="flex flex-wrap items-center gap-2 type-subtitle text-ink">
                      {item.nombre}
                      {item.plataforma && (
                        <span className="rounded-chip border border-border-strong px-1.5 py-0.5 type-overline text-ink-faint">
                          {item.plataforma}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 type-meta text-ink-muted">{item.motivo}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {generatedAt && (
            <p className="type-caption text-ink-faint">
              Generado el {new Date(generatedAt).toLocaleDateString("es-AR")}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
