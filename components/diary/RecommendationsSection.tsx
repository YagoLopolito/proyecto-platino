"use client";

import { GamePoster } from "@/components/game/GamePoster";
import { PosterGrid } from "@/components/game/PosterGrid";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useActionState } from "react";
import {
  generateRecommendations,
  type RecommendationsActionState,
} from "@/app/(app)/diario/recommendation-actions";
import type { AiRecommendations } from "@/lib/ai";
import type { RecommendationGame } from "@/lib/diary/recommendations";

const initialState: RecommendationsActionState = { recommendations: null, error: null };

/** Cuánto esfuerzo estima la IA que queda para platinar: color + etiqueta. */
const EFFORT_STYLES: Record<string, { label: string; className: string }> = {
  poco: { label: "Poco", className: "border-green-800 bg-green-950/40 text-green-400" },
  medio: { label: "Medio", className: "border-amber-800 bg-amber-950/40 text-amber-400" },
  mucho: { label: "Mucho", className: "border-red-900 bg-red-950/40 text-red-400" },
};

function EffortBadge({ effort }: { effort: string }) {
  const style = EFFORT_STYLES[effort] ?? EFFORT_STYLES.medio;
  return (
    <span
      className={`rounded border px-1 py-0.5 text-[10px] uppercase tracking-wide ${style.className}`}
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
    <section
      aria-labelledby="recomendados-heading"
      className="space-y-4 border-t border-zinc-800 pt-6 sm:pt-8"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 id="recomendados-heading" className="flex items-center gap-1.5 text-lg font-semibold">
            <span aria-hidden="true">✨</span> Recomendados para vos
          </h2>
          <p className="text-sm text-zinc-400">
            Qué seguir jugando y qué probar, según lo que jugaste en PSN, Steam y tu diario.
            Contenido generado por IA: puede tener errores.
          </p>
        </div>
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="w-full shrink-0 rounded border border-blue-700 bg-blue-900/30 px-3 py-2 text-sm text-blue-300 hover:border-blue-500 disabled:opacity-50 sm:w-auto sm:py-1.5"
          >
            {pending
              ? "Generando..."
              : recommendations
                ? "Actualizar recomendaciones"
                : "Recomendame algo"}
          </button>
        </form>
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
        >
          {state.error}
        </p>
      )}

      {!recommendations ? (
        <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          Todavía no generaste recomendaciones. Dale a &quot;Recomendame algo&quot; y la IA arma una
          lista tomando como referencia lo que jugaste, platinaste y puntuaste.
        </p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-zinc-300">{recommendations.perfil}</p>

          {keepPlaying.length > 0 && (
            <div className="space-y-2">
              <SectionHeader as="h3" title="Seguí jugando" />
              <PosterGrid>
                {keepPlaying.map((item) => {
                  const game = gamesById.get(item.juego_id)!;
                  return (
                    <li key={item.juego_id}>
                      <GamePoster
                        href={`/juegos/${game.id}`}
                        name={game.name}
                        imageUrl={game.imageUrl}
                        progress={game.total > 0 ? game : null}
                        showName
                        overlay={
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-zinc-950/85 px-1.5 py-1 text-[10px]">
                            <span className="text-zinc-300">{game.percent}%</span>
                            <EffortBadge effort={item.esfuerzo} />
                          </div>
                        }
                        caption={<span className="line-clamp-2">{item.motivo}</span>}
                      />
                    </li>
                  );
                })}
              </PosterGrid>
            </div>
          )}

          {fresh.length > 0 && (
            <div className="space-y-2">
              <SectionHeader as="h3" title="Para probar" />
              {/*
               * Estos juegos no están en la base (por definición: el usuario no
               * los tiene), así que no hay carátula ni ficha adónde linkear --
               * van como tarjetas de texto y no como grilla de portadas.
               */}
              <ul className="grid gap-2 sm:grid-cols-2">
                {fresh.map((item, i) => (
                  <li
                    key={`${item.nombre}-${i}`}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
                  >
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-100">
                      {item.nombre}
                      {item.plataforma && (
                        <span className="rounded border border-zinc-700 px-1 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                          {item.plataforma}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">{item.motivo}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {generatedAt && (
            <p className="text-xs text-zinc-600">
              Generado el {new Date(generatedAt).toLocaleDateString("es-AR")}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
