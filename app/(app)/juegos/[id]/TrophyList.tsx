"use client";

import { useEffect, useMemo, useState } from "react";
import TrophyItem from "./TrophyItem";
import { FOCUS_TROPHY_EVENT, type FocusTrophyDetail } from "./focusTrophy";
import { ProgressBar } from "@/components/ProgressBar";
import { EmptyState } from "@/components/EmptyState";
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

const SELECT_CLASS =
  "rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none";

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

  // Foco pedido desde el advisor con IA (ver `focusTrophy.ts`). Se limpian los
  // filtros antes de enfocar: si el trofeo estaba filtrado, su fila ni siquiera
  // está montada y no habría nada que abrir ni a dónde scrollear.
  useEffect(() => {
    function handleFocusTrophy(event: Event) {
      const trophyId = (event as CustomEvent<FocusTrophyDetail>).detail?.trophyId;
      if (!trophyId) return;
      setQuery("");
      setStatus("all");
      setType("all");
      setRarity("all");
      setFocus((current) => ({ trophyId, token: (current?.token ?? 0) + 1 }));
    }

    window.addEventListener(FOCUS_TROPHY_EVENT, handleFocusTrophy);
    return () => window.removeEventListener(FOCUS_TROPHY_EVENT, handleFocusTrophy);
  }, []);

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
        const rate = (t: TrophyListItem) => t.earned_rate ?? (t.rarity !== null ? t.rarity * 25 : 100);
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

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar trofeo por nombre o descripción..."
          aria-label="Buscar trofeo"
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
        />

        <div className="flex flex-wrap gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label="Filtrar por estado"
            className={SELECT_CLASS}
          >
            <option value="all">Todos los trofeos</option>
            <option value="pending">Ocultar obtenidos</option>
            <option value="obtained">Solo obtenidos</option>
          </select>

          {hasTrophyTypes && (
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TypeFilter)}
              aria-label="Filtrar por tipo"
              className={SELECT_CLASS}
            >
              <option value="all">Todos los tipos</option>
              <option value="platinum">Platino</option>
              <option value="gold">Oro</option>
              <option value="silver">Plata</option>
              <option value="bronze">Bronce</option>
            </select>
          )}

          <select
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
            aria-label="Filtrar por rareza"
            className={SELECT_CLASS}
          >
            <option value="all">Toda rareza</option>
            {Object.entries(RARITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            aria-label="Ordenar trofeos"
            className={SELECT_CLASS}
          >
            <option value="default">Orden original</option>
            <option value="rarest">Más raros primero</option>
            <option value="commonest">Más comunes primero</option>
            <option value="type">Por tipo (platino → bronce)</option>
            <option value="name">Nombre (A-Z)</option>
          </select>

          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("all");
                setType("all");
                setRarity("all");
              }}
              className="rounded border border-zinc-700 px-2 py-1.5 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <p className="text-xs text-zinc-500">
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
                <h3 className="text-sm font-medium text-zinc-300">{group.name}</h3>
                <span className="text-xs text-zinc-500">
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
              <ul className="space-y-2">
                {group.trophies.map((trophy) => (
                  <TrophyRow key={trophy.id} gameId={gameId} trophy={trophy} focus={focus} />
                ))}
              </ul>
            </div>
          ))
      ) : (
        <ul className="space-y-2">
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
