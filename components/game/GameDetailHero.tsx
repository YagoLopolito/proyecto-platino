import Image from "next/image";
import type { ReactNode } from "react";
import type { GameCardData } from "@/lib/catalog/details";

/**
 * Encabezado de la ficha de juego al estilo Letterbox: wallpaper a ancho
 * completo de la ventana, carátula grande encima, y una tira de estadísticas
 * debajo.
 *
 * Es primo de `components/diary/GameHero`, que es el de la ficha de diario y
 * además muestra descripción y puntuación de la comunidad. Este es el de la
 * pantalla de trofeos: los números que muestra son los del progreso del
 * usuario, no los del juego.
 */
export function GameDetailHero({
  game,
  badges,
  stats,
}: {
  game: GameCardData;
  /** Platino / 100%, al lado del título. */
  badges?: ReactNode;
  /** Tira de números: 2 a 4 celdas. Un valor `null` se muestra como "—". */
  stats: { label: string; value: ReactNode }[];
}) {
  const backgroundImage = game.backgroundUrl ?? game.coverUrl;
  // Sin wallpaper propio queda la carátula, que estirada a banner se ve mal:
  // en ese caso se difumina. El wallpaper real va nítido, como en Letterbox.
  const isFallbackBackground = game.backgroundUrl === null;

  const meta = [
    game.releaseYear !== null ? String(game.releaseYear) : null,
    game.platform,
    game.developer,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="relative">
      {backgroundImage && (
        // Rompe el max-w del contenedor con w-screen + left-1/2, y se funde
        // con el fondo de la página hacia abajo (mismo truco que GameHero).
        <div
          className="pointer-events-none absolute left-1/2 top-0 z-0 -mt-6 h-[200px] w-screen -translate-x-1/2 overflow-hidden sm:-mt-12 sm:h-[380px]"
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
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/40 to-zinc-950" />
        </div>
      )}

      <div className={`relative z-10 space-y-4 ${backgroundImage ? "pt-20 sm:pt-48" : ""}`}>
        <div className="flex items-end gap-3 sm:gap-5">
          <div className="relative aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-lg min-[420px]:w-28 sm:w-40">
            {game.coverUrl ? (
              <Image
                src={game.coverUrl}
                alt={game.name}
                fill
                priority
                sizes="(max-width: 420px) 96px, (max-width: 640px) 112px, 160px"
                className="object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-zinc-500">
                Sin carátula
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1 pb-1">
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold break-words sm:text-3xl">
              {game.name}
              {badges}
            </h1>
            {meta.length > 0 && (
              <p className="text-xs text-zinc-400 sm:text-sm">{meta.join(" · ")}</p>
            )}
          </div>
        </div>

        {/*
         * Tira de números, como la de una ficha de Letterbox: número grande,
         * etiqueta chica en versalitas. En mobile van dos por fila.
         */}
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-zinc-950 px-3 py-2.5">
              <dd className="text-lg font-semibold leading-tight text-zinc-50 sm:text-xl">
                {stat.value ?? "—"}
              </dd>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
