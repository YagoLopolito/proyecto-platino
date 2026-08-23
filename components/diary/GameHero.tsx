import Image from "next/image";
import type { GameCardData } from "@/lib/catalog/details";
import { GameScore } from "@/components/diary/GameScore";

const DESCRIPTION_PREVIEW_CHARS = 340;

/**
 * Ficha grande del juego al estilo Letterbox: fondo, carátula grande, año,
 * desarrolladora, descripción y el score comunitario con su distribución.
 * Todos los datos externos (descripción, desarrolladora, fondo) son
 * opcionales: si RAWG no los tiene, la ficha se degrada sin romperse.
 */
export function GameHero({
  game,
  score,
  distribution,
}: {
  game: GameCardData;
  score: { average_rating: number | null; rating_count: number | null };
  distribution: number[];
}) {
  const description = game.description?.trim() || null;
  const isLong = description !== null && description.length > DESCRIPTION_PREVIEW_CHARS;
  const totalVotes = distribution.reduce((sum, count) => sum + count, 0);
  const maxBucket = Math.max(1, ...distribution);

  const meta = [
    game.releaseYear !== null ? String(game.releaseYear) : null,
    game.platform,
    game.developer,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      {game.backgroundUrl && (
        <>
          <Image
            src={game.backgroundUrl}
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover object-top opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/85 to-zinc-900/40" />
        </>
      )}

      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
        {/*
          * Marco fijo con proporción de póster: las carátulas llegan en
          * formatos muy distintos (los íconos de PSN son cuadrados, las de RAWG
          * apaisadas), y sin un marco la imagen quedaba chica al lado del resto
          * de la ficha. object-cover recorta para llenarlo siempre igual.
          */}
        <div className="relative aspect-[3/4] w-40 shrink-0 self-start overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-lg sm:w-56">
          {game.coverUrl ? (
            <Image
              src={game.coverUrl}
              alt={game.name}
              fill
              priority
              sizes="(max-width: 640px) 160px, 224px"
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
              Sin carátula
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold sm:text-3xl">{game.name}</h1>
            {meta.length > 0 && (
              <p className="text-sm text-zinc-400">{meta.join(" · ")}</p>
            )}
          </div>

          {description ? (
            isLong ? (
              // flex-col + order: con el detalle abierto, el "Ver menos" tiene que
              // quedar DEBAJO del texto, pero un <summary> siempre va primero en
              // el DOM (es el disparador del <details>).
              <details className="group flex flex-col text-sm leading-relaxed text-zinc-300">
                <summary className="order-2 cursor-pointer list-none">
                  <span className="group-open:hidden">
                    {description.slice(0, DESCRIPTION_PREVIEW_CHARS).trimEnd()}…{" "}
                    <span className="text-blue-400">Ver más</span>
                  </span>
                  <span className="hidden text-blue-400 group-open:inline">Ver menos</span>
                </summary>
                <p className="order-1 mb-1 whitespace-pre-line">{description}</p>
              </details>
            ) : (
              <p className="text-sm leading-relaxed text-zinc-300">{description}</p>
            )
          ) : (
            <p className="text-sm text-zinc-500">
              Sin descripción disponible para este juego.
            </p>
          )}

          {description && game.descriptionSource === "ai" && (
            <p className="text-xs text-zinc-500">✨ Descripción generada por IA.</p>
          )}

          <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Puntuación de la comunidad
            </p>
            <GameScore score={score} />
            {totalVotes > 0 && (
              <ul className="flex items-end gap-1.5 pt-1" aria-label="Distribución de valoraciones">
                {distribution.map((count, index) => (
                  <li key={index} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] tabular-nums text-zinc-500">{count || ""}</span>
                    <div
                      className="w-full rounded-t bg-[var(--color-trophy-gold)]"
                      style={{ height: `${Math.max(2, (count / maxBucket) * 44)}px` }}
                      title={`${index + 1} ★: ${count}`}
                    />
                    <span className="text-[10px] text-zinc-600">{index + 1}★</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
