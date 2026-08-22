"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Estado de un filtro sincronizado con la query string de la URL.
 *
 * Por qué la URL y no `useState` a secas ni `sessionStorage`: la query string
 * es lo único que sobrevive a los tres casos a la vez -- recargar la página,
 * volver con el botón "atrás" del browser (la entrada del historial guarda la
 * URL con los filtros aplicados) y compartir//marcar el link ya filtrado.
 *
 * La URL se actualiza con `window.history.replaceState`, no con
 * `router.replace`:
 *
 * - `replaceState` (soportado oficialmente por Next para este caso) sólo
 *   reescribe la entrada actual del historial, sin disparar una navegación:
 *   no re-ejecuta el Server Component ni vuelve a pegarle a Supabase. Estos
 *   filtros son 100% client-side (ver DiaryTimeline), así que un round-trip
 *   al server por cada click sería puro lag.
 * - `replace` y no `push` para que "atrás" vuelva a la página anterior y no
 *   vaya deshaciendo filtro por filtro.
 *
 * El valor por defecto no se escribe en la URL (se borra el parámetro), así
 * la URL queda limpia mientras no haya ningún filtro activo.
 */
export function useUrlFilterState<T>(
  key: string,
  defaultValue: T,
  codec: { parse: (raw: string) => T | null; serialize: (value: T) => string },
): [T, (value: T) => void] {
  const searchParams = useSearchParams();

  // Inicialización perezosa: la URL sólo se lee en el primer render (montaje).
  // Después manda el estado local, que es el que el usuario está tocando.
  const [value, setValue] = useState<T>(() => {
    const raw = searchParams.get(key);
    if (raw === null) return defaultValue;
    return codec.parse(raw) ?? defaultValue;
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);

      // Se lee `window.location` en cada llamada (en vez de cerrar sobre
      // `searchParams`) para que dos updates seguidos en el mismo handler
      // -- p.ej. sort + dirección -- se compongan en vez de pisarse.
      const params = new URLSearchParams(window.location.search);
      if (next === defaultValue) params.delete(key);
      else params.set(key, codec.serialize(next));

      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
    },
    // `codec` se pasa inline en los call sites (identidad nueva por render),
    // por eso se excluye a propósito: sus funciones son puras y estables en
    // comportamiento. `key`/`defaultValue` sí son primitivos estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, defaultValue],
  );

  return [value, update];
}

/** Codec para filtros que son una opción de una lista cerrada. */
export function oneOf<T extends string>(options: readonly T[]) {
  return {
    parse: (raw: string): T | null => (options.includes(raw as T) ? (raw as T) : null),
    serialize: (value: T) => value,
  };
}

/** Codec para checkboxes: sólo `1` cuenta como true. */
export const boolean = {
  parse: (raw: string): boolean | null => (raw === "1" ? true : raw === "0" ? false : null),
  serialize: (value: boolean) => (value ? "1" : "0"),
};

/** Codec para filtros de texto libre (año, plataforma: valores dinámicos). */
export const text = {
  parse: (raw: string): string | null => raw,
  serialize: (value: string) => value,
};
