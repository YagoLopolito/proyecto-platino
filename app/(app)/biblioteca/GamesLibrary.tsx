"use client";

import { useMemo } from "react";
import Link from "next/link";
import { GamePoster } from "@/components/game/GamePoster";
import { PosterGrid } from "@/components/game/PosterGrid";
import { formatPlaytime } from "@/lib/playtime";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { MobileDisclosure } from "@/components/ui/MobileDisclosure";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import type { PsnTrophyType } from "@/components/TrophyTypeIcon";
import { boolean, oneOf, text, useUrlFilterState } from "@/lib/hooks/useUrlFilterState";
import { matchesSearch } from "@/lib/library/search";

export type LibraryGame = {
  id: string;
  name: string;
  platform: string | null;
  imageUrl: string | null;
  addedAt: string;
  lastPlayedAt: string | null;
  total: number;
  obtained: number;
  percent: number;
  counts: Record<PsnTrophyType, number>;
  source: string | null;
  playtimeMinutes: number | null;
};

type SortOption = "recent" | "name" | "percent" | "playtime";
type SortDirection = "asc" | "desc";
type FilterOption = "all" | "platinum" | "over50";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recent", label: "Jugados recientemente" },
  { value: "name", label: "Nombre" },
  { value: "percent", label: "% completado" },
  { value: "playtime", label: "Horas jugadas" },
];

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "platinum", label: "Platinados" },
  { value: "over50", label: "+50% progreso" },
];

/** Orden de cada criterio cuando la dirección es "desc" (la que muestra el botón al elegirlo por primera vez). */
function compareDescending(a: LibraryGame, b: LibraryGame, sort: SortOption): number {
  if (sort === "name") return b.name.localeCompare(a.name);
  if (sort === "percent") return b.percent - a.percent;
  // Sin horas conocidas (juegos de catálogo, o de PSN/Steam que no las
  // reportan) van al fondo del orden descendente, no mezclados con los de 0 h.
  if (sort === "playtime") return (b.playtimeMinutes ?? -1) - (a.playtimeMinutes ?? -1);

  const aTime = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : null;
  const bTime = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : null;
  if (aTime !== null && bTime !== null) return bTime - aTime;
  if (aTime !== null) return -1;
  if (bTime !== null) return 1;
  return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
}

function sortGames(
  games: LibraryGame[],
  sort: SortOption,
  direction: SortDirection,
): LibraryGame[] {
  const sorted = [...games].sort((a, b) => compareDescending(a, b, sort));
  return direction === "asc" ? sorted.reverse() : sorted;
}

/**
 * Búsqueda por nombre. La lógica vive en `lib/library/search.ts` (módulo puro,
 * testeado aparte): saca acentos y puntuación de los dos lados y exige todas
 * las palabras tipeadas, en cualquier orden.
 */
function searchGames(games: LibraryGame[], query: string): LibraryGame[] {
  if (query.trim() === "") return games;
  return games.filter((game) => matchesSearch(game.name, query));
}

function filterGames(games: LibraryGame[], filter: FilterOption): LibraryGame[] {
  // Steam no tiene platino: un juego suyo nunca entra acá, y su equivalente
  // (100% de logros) se ve como badge propio en la tarjeta.
  if (filter === "platinum") return games.filter((game) => game.counts.platinum > 0);
  if (filter === "over50") return games.filter((game) => game.percent > 50);
  return games;
}

export default function GamesLibrary({ games }: { games: LibraryGame[] }) {
  // Los filtros viven en la query string para sobrevivir al "atrás" del
  // browser (volver desde el detalle de un juego) y al reload -- ver
  // useUrlFilterState.
  const [sort, setSort] = useUrlFilterState<SortOption>(
    "orden",
    "recent",
    oneOf(SORT_OPTIONS.map((option) => option.value)),
  );
  const [direction, setDirection] = useUrlFilterState<SortDirection>(
    "dir",
    "desc",
    oneOf(["asc", "desc"] as const),
  );
  const [filter, setFilter] = useUrlFilterState<FilterOption>(
    "filtro",
    "all",
    oneOf(FILTER_OPTIONS.map((option) => option.value)),
  );
  const [hidePlatinum, setHidePlatinum] = useUrlFilterState("sinPlatino", false, boolean);
  const [hideUnstarted, setHideUnstarted] = useUrlFilterState("sinEmpezar", false, boolean);
  const [query, setQuery] = useUrlFilterState("q", "", text);

  const visibleGames = useMemo(() => {
    const filtered = filterGames(searchGames(games, query), filter);
    // "Platinado" cubre las dos plataformas: el platino de PSN y su
    // equivalente en Steam, el 100% de logros (Steam no tiene platino).
    const withoutPlatinum = hidePlatinum
      ? filtered.filter((game) => {
          const isPsnPlatinum = game.counts.platinum > 0;
          const isSteam100 = game.source === "steam" && game.total > 0 && game.percent === 100;
          return !isPsnPlatinum && !isSteam100;
        })
      : filtered;
    const withoutUnstarted = hideUnstarted
      ? withoutPlatinum.filter((game) => game.percent > 0)
      : withoutPlatinum;
    return sortGames(withoutUnstarted, sort, direction);
  }, [games, query, sort, direction, filter, hidePlatinum, hideUnstarted]);

  // Cuántos filtros hay puestos, para el globito del botón "Filtros" en
  // mobile: sin eso, plegados, no hay forma de saber que la biblioteca está
  // recortada. El orden no cuenta (siempre hay uno) ni la búsqueda (el campo
  // se ve siempre, con su texto adentro).
  const activeFilterCount =
    (filter === "all" ? 0 : 1) + (hidePlatinum ? 1 : 0) + (hideUnstarted ? 1 : 0);

  function clearFilters() {
    setFilter("all");
    setHidePlatinum(false);
    setHideUnstarted(false);
  }

  return (
    // Nombre accesible propio: desde #191 un juego puede aparecer también en
    // los carruseles de arriba (Jugando ahora, Seguí jugando, Cerca del
    // platino), y "la grilla" tiene que poder encontrarse sola.
    <section className="space-y-3" aria-label="Tu biblioteca">
      <SectionHeader
        title={
          <>
            Tu biblioteca{" "}
            {games.length > 0 && (
              <span className="tabular-nums text-ink-faint">
                {visibleGames.length}/{games.length}
              </span>
            )}
          </>
        }
      />

      {/*
       * Barra de controles: el buscador siempre a la vista (es lo que se usa
       * con 365 juegos) y, en mobile, el resto detrás de "Filtros" con el
       * globito de cuántos hay puestos. En `sm` la disclosure es `contents` y
       * todo queda en una sola fila, como en escritorio.
       */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={query}
          onChange={setQuery}
          label="Buscar juego en tu biblioteca"
          placeholder="Buscar un juego…"
          className="min-w-0 flex-1 sm:max-w-xs"
        />

        {games.length > 1 && (
          <MobileDisclosure label="Filtros" activeCount={activeFilterCount}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                <Select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortOption)}
                  aria-label="Ordenar por"
                  className="min-w-0 flex-1 sm:w-48 sm:flex-none"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>

                <button
                  type="button"
                  onClick={() => setDirection(direction === "desc" ? "asc" : "desc")}
                  aria-label={
                    direction === "desc"
                      ? "Orden descendente, invertir"
                      : "Orden ascendente, invertir"
                  }
                  className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-card border border-border-strong bg-surface text-ink-muted transition-colors hover:border-ink-faint hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 sm:min-h-9 sm:w-9"
                >
                  <Icon
                    name="arrow-down"
                    className={`h-4 w-4 transition-transform ${direction === "asc" ? "rotate-180" : ""}`}
                  />
                </button>
              </div>

              <SegmentedControl
                options={FILTER_OPTIONS}
                value={filter}
                onChange={setFilter}
                label="Filtrar biblioteca"
                className="w-full sm:w-auto"
              />

              <ToggleChip checked={hidePlatinum} onChange={setHidePlatinum}>
                Ocultar platinados
              </ToggleChip>
              <ToggleChip checked={hideUnstarted} onChange={setHideUnstarted}>
                Ocultar en 0%
              </ToggleChip>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-10 px-1 type-caption font-medium text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 sm:min-h-9"
                >
                  Limpiar
                </button>
              )}
            </div>
          </MobileDisclosure>
        )}
      </div>

      {games.length === 0 && (
        <EmptyState
          icon="gamepad"
          title={
            <>
              Todavía no hay juegos.{" "}
              <Link href="/configuracion/conexiones" className="text-accent-ink hover:underline">
                Conectá tu cuenta PSN
              </Link>{" "}
              para traerlos automáticamente.
            </>
          }
        />
      )}

      {games.length > 0 && visibleGames.length === 0 && (
        <EmptyState
          icon="search"
          title={
            query.trim() !== ""
              ? `Ningún juego de tu biblioteca coincide con “${query.trim()}”.`
              : "Ningún juego coincide con este filtro."
          }
        />
      )}

      {/*
       * Grilla de carátulas al estilo Letterbox. Lo que antes era una fila de
       * texto por juego (progreso, horas, desglose por tipo de trofeo) ahora
       * está en la ficha: acá queda la barra fina de progreso sobre la
       * carátula y el badge de platino / 100%, que es el vistazo rápido que
       * un tracker sí necesita.
       */}
      <PosterGrid>
        {visibleGames.map((game) => {
          const isSteam = game.source === "steam";
          const playtime = formatPlaytime(game.playtimeMinutes);
          return (
            <li key={game.id} data-testid="game-card">
              <GamePoster
                href={`/juegos/${game.id}`}
                name={game.name}
                imageUrl={game.imageUrl}
                progress={game.total > 0 ? game : null}
                isPlatinum={!isSteam && game.counts.platinum > 0}
                isCompleted={isSteam && game.total > 0 && game.obtained === game.total}
                showName
                caption={
                  game.total > 0 ? (
                    <span className="flex flex-wrap items-center gap-x-1.5">
                      <span className="tabular-nums">{game.percent}%</span>
                      {playtime && (
                        // El ⏱ que había acá era el último emoji de la
                        // biblioteca (issue #176 §3.3).
                        <span className="flex items-center gap-1 text-ink-faint">
                          <Icon name="clock" className="h-3 w-3" />
                          <span className="tabular-nums">{playtime}</span>
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-ink-faint">Sin sincronizar</span>
                  )
                }
              />
            </li>
          );
        })}
      </PosterGrid>
    </section>
  );
}
