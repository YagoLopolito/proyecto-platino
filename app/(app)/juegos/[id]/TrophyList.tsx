"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TrophyItem from "./TrophyItem";
import { FOCUS_TROPHY_PARAM } from "./focusTrophy";
import { ProgressBar } from "@/components/ProgressBar";
import { EmptyState } from "@/components/EmptyState";
import { MobileDisclosure } from "@/components/ui/MobileDisclosure";
import { SearchField } from "@/components/ui/SearchField";
import { Select } from "@/components/ui/Select";
import { RARITY_LABEL } from "@/components/trophyRarity";

export type TrophyListItem = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  hidden: boolean;
  icon_url: string | null;
  rarity: number | null;
  earned_rate: number | null;
  progress_target: string | null;
  obtained: boolean;
};

export type TrophyListGroup = {
  groupId: string;
  name: string;
  trophies: TrophyListItem[];
};

type StatusFilter = "all" | "pending" | "obtained";
type TypeFilter = "all" | "bronze" | "silver" | "gold" | "platinum";
type SortOption = "default" | "rarest" | "commonest" | "type" | "name";

/** Orden de "valor" del trofeo, para ordenar por tipo de mayor a menor. */
const TYPE_WEIGHT: Record<string, number> = { platinum: 0, gold: 1, silver: 2, bronze: 3 };

/**
 * Toda la lista de trofeos con sus filtros. El dataset es el de un solo juego
 * (decenas de filas, no miles), así que filtrar y ordenar client-side alcanza y
 * evita un round-trip al server por cada cambio de filtro -- mismo criterio que
 * el timeline de `/diario`.
 */
export default function TrophyList({
  gameId,
  groups,
  showGroups,
}: {
  gameId: string;
  groups: TrophyListGroup[];
  showGroups: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [rarity, setRarity] = useState<string>("all");
  const [sort, setSort] = useState<SortOption>("default");
  const [focus, setFocus] = useState<{ trophyId: string; token: number } | null>(null);

  // Foco pedido desde el advisor con IA (`?trofeo=<id>`, ver `focusTrophy.ts`).
  // Se compara contra el último pedido durante el render y no en un effect
  // (regla `react-hooks/set-state-in-effect`, ver CLAUDE.md). Se limpian los
  // filtros antes de enfocar: si el trofeo estaba filtrado, su fila ni siquiera
  // está montada y no habría nada que abrir ni a dónde scrollear.
  const requestedTrophyId = useSearchParams().get(FOCUS_TROPHY_PARAM);
  const [handledRequest, setHandledRequest] = useState<string | null>(null);
  if (requestedTrophyId !== handledRequest) {
    setHandledRequest(requestedTrophyId);
    if (requestedTrophyId) {
      setQuery("");
      setStatus("all");
      setType("all");
      setRarity("all");
      setFocus((current) => ({ trophyId: requestedTrophyId, token: (current?.token ?? 0) + 1 }));
    }
  }

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return groups.map((group) => {
      const trophies = group.trophies.filter((trophy) => {
        if (status === "pending" && trophy.obtained) return false;
        if (status === "obtained" && !trophy.obtained) return false;
        if (type !== "all" && trophy.type !== type) return false;
        if (rarity !== "all" && String(trophy.rarity) !== rarity) return false;
        if (normalizedQuery) {
          const haystack = `${trophy.name} ${trophy.description ?? ""}`.toLowerCase();
          if (!haystack.includes(normalizedQuery)) return false;
        }
        return true;
      });

      const sorted = [...trophies];
      if (sort === "rarest" || sort === "commonest") {
        // `earned_rate` (% que lo desbloqueó) es más granular que `rarity`, que
        // solo tiene 4 escalones; se usa como criterio principal cuando está.
        const rate = (t: TrophyListItem) =>
          t.earned_rate ?? (t.rarity !== null ? t.rarity * 25 : 100);
        sorted.sort((a, b) => (sort === "rarest" ? rate(a) - rate(b) : rate(b) - rate(a)));
      } else if (sort === "type") {
        sorted.sort((a, b) => (TYPE_WEIGHT[a.type] ?? 9) - (TYPE_WEIGHT[b.type] ?? 9));
      } else if (sort === "name") {
        sorted.sort((a, b) => a.name.localeCompare(b.name, "es"));
      }

      const obtainedCount = sorted.filter((t) => t.obtained).length;
      return { ...group, trophies: sorted, obtainedCount, visibleTotal: sorted.length };
    });
  }, [groups, query, status, type, rarity, sort]);

  // Los logros de Steam son todos del mismo tipo: el selector de tipo no
  // filtraría nada y solo sumaría ruido, así que no se muestra.
  const hasTrophyTypes = groups.some((group) =>
    group.trophies.some((trophy) => trophy.type !== "achievement"),
  );

  const visibleCount = filteredGroups.reduce((acc, g) => acc + g.trophies.length, 0);
  const totalCount = groups.reduce((acc, g) => acc + g.trophies.length, 0);
  const hasFilters = query.trim() !== "" || status !== "all" || type !== "all" || rarity !== "all";
  // El globito del botón plegado: cuántos filtros recortan la lista. La
  // búsqueda no cuenta (su campo se ve siempre, con el texto adentro).
  const activeFilterCount =
    (status === "all" ? 0 : 1) + (type === "all" ? 0 : 1) + (rarity === "all" ? 0 : 1);

  return (
    <div className="space-y-4">
      <div className="space-y-2.5 rounded-card border border-border bg-surface p-3">
        <SearchField
          value={query}
          onChange={setQuery}
          label="Buscar trofeo"
          placeholder="Buscar un trofeo…"
        />

        {/* En mobile los cuatro selectores viven plegados: el buscador
            alcanza para el 90% de los casos y así la lista de trofeos
            empieza arriba del pliegue. En `sm` se ven siempre. */}
        <MobileDisclosure label="Filtros y orden" activeCount={activeFilterCount}>
          {/* Dos columnas en mobile (cuatro selectores apilados a lo largo
              eran una columna interminable) y en fila desde `sm`. */}
          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              aria-label="Filtrar por estado"
            >
              <option value="all">Todos los trofeos</option>
              <option value="pending">Ocultar obtenidos</option>
              <option value="obtained">Solo obtenidos</option>
            </Select>

            {hasTrophyTypes && (
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as TypeFilter)}
                aria-label="Filtrar por tipo"
              >
                <option value="all">Todos los tipos</option>
                <option value="platinum">Platino</option>
                <option value="gold">Oro</option>
                <option value="silver">Plata</option>
                <option value="bronze">Bronce</option>
              </Select>
            )}

            <Select
              value={rarity}
              onChange={(e) => setRarity(e.target.value)}
              aria-label="Filtrar por rareza"
            >
              <option value="all">Toda rareza</option>
              {Object.entries(RARITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>

            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              aria-label="Ordenar trofeos"
            >
              <option value="default">Orden original</option>
              <option value="rarest">Más raros primero</option>
              <option value="commonest">Más comunes primero</option>
              <option value="type">Por tipo (platino → bronce)</option>
              <option value="name">Nombre (A-Z)</option>
            </Select>

            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setType("all");
                  setRarity("all");
                }}
                className="min-h-10 px-1 type-caption font-medium text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 sm:min-h-9"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </MobileDisclosure>

        <p className="type-caption text-ink-faint">
          Mostrando {visibleCount} de {totalCount} trofeos
        </p>
      </div>

      {visibleCount === 0 ? (
        <EmptyState title="Ningún trofeo coincide con los filtros." />
      ) : showGroups ? (
        filteredGroups
          .filter((group) => group.trophies.length > 0)
          .map((group) => (
            <div key={group.groupId} className="space-y-2">
              <div className="flex items-center justify-between gap-2 pt-2">
                <h3 className="type-overline text-ink-faint">{group.name}</h3>
                <span className="type-caption tabular-nums text-ink-faint">
                  {group.obtainedCount}/{group.visibleTotal} visibles
                </span>
              </div>
              <ProgressBar
                percent={
                  group.visibleTotal > 0
                    ? Math.round((group.obtainedCount / group.visibleTotal) * 100)
                    : 0
                }
                className="h-1.5"
              />
              <ul className="border-t border-border">
                {group.trophies.map((trophy) => (
                  <TrophyRow key={trophy.id} gameId={gameId} trophy={trophy} focus={focus} />
                ))}
              </ul>
            </div>
          ))
      ) : (
        <ul className="border-t border-border">
          {filteredGroups.flatMap((group) =>
            group.trophies.map((trophy) => (
              <TrophyRow key={trophy.id} gameId={gameId} trophy={trophy} focus={focus} />
            )),
          )}
        </ul>
      )}
    </div>
  );
}

function TrophyRow({
  gameId,
  trophy,
  focus,
}: {
  gameId: string;
  trophy: TrophyListItem;
  focus: { trophyId: string; token: number } | null;
}) {
  return (
    <TrophyItem
      focusToken={focus?.trophyId === trophy.id ? focus.token : null}
      gameId={gameId}
      trophyId={trophy.id}
      name={trophy.name}
      description={trophy.description}
      type={trophy.type}
      hidden={trophy.hidden}
      iconUrl={trophy.icon_url}
      isObtained={trophy.obtained}
      rarity={trophy.rarity}
      earnedRate={trophy.earned_rate}
      progressTarget={trophy.progress_target}
    />
  );
}
