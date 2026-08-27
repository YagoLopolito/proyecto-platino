import Image from "next/image";
import type { GameCardData } from "@/lib/catalog/details";
import { GameScore } from "@/components/diary/GameScore";
import { formatPlaytime } from "@/lib/playtime";

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
  playtimeMinutes,
}: {
  game: GameCardData;
  score: { average_rating: number | null; rating_count: number | null };
  distribution: number[];
  /**
   * Horas del usuario que está mirando, no del juego: el diario es público
   * pero `user_games` es de cada uno. NULL/0 = no se muestra nada (juegos de
   * catálogo, o de PSN sin horas reportadas).
   */
  playtimeMinutes?: number | null;
}) {
  const playtime = formatPlaytime(playtimeMinutes);
  const description = game.description?.trim() || null;
  const isLong = description !== null && description.length > DESCRIPTION_PREVIEW_CHARS;
  const totalVotes = distribution.reduce((sum, count) => sum + count, 0);
  const maxBucket = Math.max(1, ...distribution);

  // Sin wallpaper propio, la carátula difuminada hace de fondo.
  const backgroundImage = game.backgroundUrl ?? game.coverUrl;

  const meta = [
    game.releaseYear !== null ? String(game.releaseYear) : null,
    game.platform,
    game.developer,
  ].filter((value): value is string => Boolean(value));

  // Sin wallpaper propio queda la carátula, que estirada a banner se ve mal:
  // en ese caso se difumina. El wallpaper real va nítido, como en Letterbox.
  const isFallbackBackground = game.backgroundUrl === null;

  return (
    <div className="relative">
      {/*
       * Backdrop a ancho completo de la ventana (rompe el max-w del contenedor
       * con el truco de w-screen + left-1/2 + -translate-x-1/2) y se funde con
       * el fondo de la página hacia abajo, como la ficha de Letterbox. El
       * -mt compensa el padding superior de la página para que arranque pegado
       * a la barra de navegación.
       */}
      {backgroundImage && (
        <div
          className="pointer-events-none absolute left-1/2 top-0 z-0 -mt-6 h-[220px] w-screen -translate-x-1/2 overflow-hidden sm:-mt-12 sm:h-[420px]"
          aria-hidden="true"
        >
          <Image
            src={backgroundImage}
            alt=""
            fill
            priority
            quality={90}
            sizes="100vw"
            className={`object-cover object-top ${
              isFallbackBackground ? "scale-110 opacity-40 blur-lg" : "opacity-70"
            }`}
          />
          {/* Degradado doble: oscurece de arriba para que se lea la nav, y
              funde el final de la imagen con el fondo de la página. */}
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/40 to-zinc-950" />
        </div>
      )}

      <div
        className={`relative z-10 flex flex-col gap-4 sm:flex-row sm:gap-5 ${
          backgroundImage ? "pt-24 sm:pt-56" : ""
        }`}
      >
        {/*
         * Marco fijo con proporción de póster: las carátulas llegan en
         * formatos muy distintos (los íconos de PSN son cuadrados, las de RAWG
         * apaisadas), y sin un marco la imagen quedaba chica al lado del resto
         * de la ficha. object-cover recorta para llenarlo siempre igual.
         */}
        <div className="relative aspect-[3/4] w-32 shrink-0 self-start overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-lg min-[420px]:w-40 sm:w-56">
          {game.coverUrl ? (
            <Image
              src={game.coverUrl}
              alt={game.name}
              fill
              priority
              sizes="(max-width: 420px) 128px, (max-width: 640px) 160px, 224px"
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
              Sin carátula
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3 rounded-xl bg-zinc-950/70 p-3 backdrop-blur-sm sm:p-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold break-words sm:text-3xl">{game.name}</h1>
            {meta.length > 0 && (
              <p className="text-xs text-zinc-400 sm:text-sm">{meta.join(" · ")}</p>
            )}
            {playtime && (
              <p className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/70 px-2.5 py-0.5 text-xs text-zinc-300">
                <span aria-hidden="true">⏱</span> {playtime} jugadas
              </p>
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
            <p className="text-sm text-zinc-500">Sin descripción disponible para este juego.</p>
          )}

          {description && game.descriptionSource === "ai" && (
            <p className="text-xs text-zinc-500">✨ Descripción generada por IA.</p>
          )}

          <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Puntuación de la comunidad
            </p>
            <GameScore score={score} />
            {totalVotes > 0 && (
              <ul
                className="flex items-end gap-1 pt-1 sm:gap-1.5"
                aria-label="Distribución de valoraciones"
              >
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
