import type { ReactNode } from "react";
import Link from "next/link";
import { GameArt } from "@/components/game/GameArt";
import type { GameCardData } from "@/lib/catalog/details";
import { TimeToBeat, timeToBeatProps } from "@/components/game/TimeToBeat";
import { formatPlaytime } from "@/lib/playtime";
import { Icon } from "@/components/ui/Icon";

const DESCRIPTION_PREVIEW_CHARS = 340;

/**
 * Encabezado de la ficha de juego (epic #183, issue #186).
 *
 * Reemplaza a los dos "primos" que había: `GameDetailHero` (ficha de trofeos)
 * y `diary/GameHero` (ficha de diario). Con una sola ficha con tabs, el
 * encabezado es uno y lo que cambiaba entre los dos -- la tira de progreso,
 * el score comunitario -- pasó a su lugar: el progreso a la tab Trofeos y el
 * score al panel de acciones.
 *
 * Estructura, como la ficha de una película en Letterboxd:
 * - Backdrop a ancho completo de la ventana (`w-screen` + `left-1/2` +
 *   `-translate-x-1/2`) que se funde con el fondo hacia abajo.
 * - Escritorio (`lg`): tres columnas -- póster · datos · panel (`aside`).
 * - Mobile: póster y título lado a lado, los datos abajo, y el panel después.
 */
export function GameHero({
  game,
  badges,
  playtimeMinutes,
  hasPlatinum,
  aside,
}: {
  game: GameCardData;
  /** Platino / 100%, al lado del título. */
  badges?: ReactNode;
  /**
   * Horas del usuario que mira, no del juego: la ficha es pública pero
   * `user_games` es de cada uno. NULL/0 = no se muestra nada.
   */
  playtimeMinutes: number | null;
  /** El juego tiene trofeo de platino: cambia la etiqueta del tiempo de completitud. */
  hasPlatinum: boolean;
  /** Panel de acciones: tercera columna en escritorio, debajo de los datos en mobile. */
  aside?: ReactNode;
}) {
  const playtime = formatPlaytime(playtimeMinutes);
  const description = game.description?.trim() || null;
  const isLong = description !== null && description.length > DESCRIPTION_PREVIEW_CHARS;

  // Sin wallpaper propio queda la carátula, que estirada a banner se ve mal:
  // en ese caso se difumina. El wallpaper real va nítido, como en Letterboxd.
  const backgroundImage = game.backgroundUrl ?? game.coverUrl;
  const isFallbackBackground = game.backgroundUrl === null;

  const meta = [
    game.releaseYear !== null ? String(game.releaseYear) : null,
    game.platform,
    // Sin estudios de IGDB (juego que no conoce, o todavía sin consultar)
    // queda la desarrolladora en texto que trae RAWG.
    game.studios.length === 0 ? game.developer : null,
  ].filter((value): value is string => Boolean(value));

  // Estudios linkeables (issue #193): desarrolladoras primero, después
  // publishers. Un estudio que desarrolla y publica aparece una sola vez.
  const studios = game.studios
    .filter((studio) => studio.role === "developer" || studio.role === "publisher")
    .filter((studio, index, all) => all.findIndex((s) => s.slug === studio.slug) === index);

  return (
    <div className="relative">
      {backgroundImage && (
        <div
          className="pointer-events-none absolute left-1/2 top-0 z-0 h-[220px] w-screen -translate-x-1/2 overflow-hidden sm:h-[420px]"
          aria-hidden="true"
        >
          <GameArt
            src={backgroundImage}
            alt=""
            priority
            sizes="100vw"
            className={`object-cover object-top ${
              isFallbackBackground ? "scale-110 opacity-40 blur-lg" : "opacity-70"
            }`}
            fallback={null}
          />
          {/* Oscurece arriba para que se lea el header, y funde el final de la
              imagen con el fondo de la página. */}
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/40 to-background" />
        </div>
      )}

      <div
        className={`relative z-10 grid grid-cols-[auto_1fr] gap-x-4 gap-y-4 sm:gap-x-6 lg:grid-cols-[13rem_1fr_16rem] ${
          backgroundImage ? "pt-24 sm:pt-56" : "pt-6"
        }`}
      >
        {/* Póster. Marco fijo 3:4: las carátulas llegan de fuentes con
            proporciones muy distintas y sin marco la ficha bailaba. */}
        <div className="relative aspect-[3/4] w-28 self-start overflow-hidden rounded-card border border-border-strong bg-surface shadow-lg min-[420px]:w-32 sm:w-44 lg:row-span-2 lg:w-full">
          {game.coverUrl ? (
            <GameArt
              src={game.coverUrl}
              alt={game.name}
              priority
              sizes="(max-width: 420px) 112px, (max-width: 640px) 128px, 208px"
              className="object-cover"
              fallback={<CoverPlaceholder />}
            />
          ) : (
            <CoverPlaceholder />
          )}
        </div>

        {/* Título y metadatos: en mobile al lado del póster, alineados abajo. */}
        <div className="min-w-0 space-y-2 self-end lg:self-start lg:pt-2">
          {/* El nombre del juego es el texto editorial de la pantalla: va en
              la serif (`type-display`). Los metadatos son chrome, en versalitas. */}
          <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-2 break-words type-display text-ink">
            <span>{game.name}</span>
            {badges}
          </h1>
          {meta.length > 0 && <p className="type-overline text-ink-faint">{meta.join(" · ")}</p>}
          {studios.length > 0 && (
            <p aria-label="Estudios" className="flex flex-wrap gap-x-2 type-overline text-ink-faint">
              {studios.map((studio, index) => (
                <span key={studio.slug}>
                  <Link
                    href={`/estudios/${encodeURIComponent(studio.slug)}`}
                    className="text-ink-muted hover:text-accent-ink hover:underline"
                  >
                    {studio.name}
                  </Link>
                  {index < studios.length - 1 && <span aria-hidden="true"> ·</span>}
                </span>
              ))}
            </p>
          )}
          {playtime && (
            <p className="inline-flex items-center gap-1.5 rounded-chip border border-border bg-surface/70 px-2.5 py-1 type-meta text-ink-muted">
              <Icon name="clock" className="h-3.5 w-3.5 text-ink-faint" />
              {playtime} jugadas
            </p>
          )}
        </div>

        {/* Tiempos y descripción. Un solo nodo ubicado por la grilla (a lo
            ancho debajo del póster en mobile, debajo del título en escritorio),
            no dos copias escondidas por breakpoint: duplicado, el texto
            aparecería dos veces para un lector de pantalla y para los tests. */}
        <div className="col-span-2 space-y-3 lg:col-span-1 lg:col-start-2 lg:row-start-2">
          <GameAbout
            game={game}
            description={description}
            isLong={isLong}
            hasPlatinum={hasPlatinum}
          />
        </div>

        {aside && (
          <div className="col-span-2 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1">
            {aside}
          </div>
        )}
      </div>
    </div>
  );
}

/** Tiempos estimados + descripción, con "Ver más" si es larga. */
function GameAbout({
  game,
  description,
  isLong,
  hasPlatinum,
}: {
  game: GameCardData;
  description: string | null;
  isLong: boolean;
  hasPlatinum: boolean;
}) {
  return (
    <>
      <TimeToBeat {...timeToBeatProps(game)} hasPlatinum={hasPlatinum} />

      {description ? (
        isLong ? (
          // flex-col + order: con el detalle abierto, el "Ver menos" tiene que
          // quedar DEBAJO del texto, pero un <summary> siempre va primero en el
          // DOM (es el disparador del <details>).
          <details className="group flex flex-col type-review text-ink-muted">
            <summary className="order-2 cursor-pointer list-none">
              <span className="group-open:hidden">
                {description.slice(0, DESCRIPTION_PREVIEW_CHARS).trimEnd()}…{" "}
                <span className="text-accent-ink">Ver más</span>
              </span>
              <span className="hidden text-accent-ink group-open:inline">Ver menos</span>
            </summary>
            <p className="order-1 mb-1 whitespace-pre-line">{description}</p>
          </details>
        ) : (
          <p className="type-review text-ink-muted">{description}</p>
        )
      ) : (
        <p className="type-body text-ink-faint">Sin descripción disponible para este juego.</p>
      )}

      {description && game.descriptionSource === "ai" && (
        <p className="flex items-center gap-1.5 type-caption text-ink-faint">
          <Icon name="sparkle" className="h-3.5 w-3.5" />
          Descripción generada por IA.
        </p>
      )}
    </>
  );
}

/** Marco sin carátula: el juego no tiene imagen, o la que tenía no cargó. */
function CoverPlaceholder() {
  return (
    <span className="flex h-full w-full items-center justify-center p-2 text-center type-caption text-ink-muted">
      Sin carátula
    </span>
  );
}
