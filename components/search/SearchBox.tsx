"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchField } from "@/components/ui/SearchField";
import { MIN_QUERY_LENGTH } from "@/lib/catalog/constants";
import { searchHref, type SearchScope } from "@/lib/search/scopes";

/** Espera entre la última tecla y la búsqueda. */
const DEBOUNCE_MS = 350;

/**
 * El campo de `/buscar` (issue #194). Tipear busca con debounce y deja la
 * query en la URL (`router.replace`: cada tecla no es una entrada del
 * historial); **no guarda** en recientes. Enter sí: el `<form>` va a
 * `/buscar/ir`, que guarda y vuelve a los resultados. Sin JS, el form solo
 * alcanza para buscar.
 */
export function SearchBox({ query, scope }: { query: string; scope: SearchScope }) {
  const router = useRouter();
  const [value, setValue] = useState(query);
  // Si la URL cambia desde afuera (una reciente, "atrás"), el campo la sigue.
  // Se ajusta durante el render, no en un effect (ver Convenciones de código).
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setValue(query);
  }

  useEffect(() => {
    const term = value.trim();
    if (term === query.trim()) return;
    if (term !== "" && term.length < MIN_QUERY_LENGTH) return;
    const timer = setTimeout(() => router.replace(searchHref(term, scope)), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, query, scope, router]);

  return (
    <form action="/buscar/ir" method="get" role="search">
      <input type="hidden" name="en" value={scope} />
      <SearchField
        name="q"
        value={value}
        onChange={setValue}
        autoFocus={query === ""}
        placeholder="Nombre del juego, estudio o lista…"
        label="Buscar"
      />
    </form>
  );
}
