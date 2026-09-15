"use client";

import { useId } from "react";

/**
 * Campo de búsqueda de la app: lupa adentro, botón de limpiar cuando hay
 * texto, y el mismo alto de toque (44px) que el resto de los controles.
 *
 * Es controlado y sin debounce propio a propósito: los dos lugares que lo usan
 * (biblioteca y lista de trofeos) filtran en memoria sobre datos que ya están
 * en el cliente, así que no hay round-trip que amortiguar. El que necesite
 * debounce que lo ponga afuera (ver `CatalogSearchCombobox`, que sí pega al
 * server).
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Etiqueta accesible: el campo no tiene `<label>` visible. */
  label: string;
  className?: string;
}) {
  const id = useId();

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>

      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        // `[&::-webkit-search-cancel-button]:hidden`: Safari/Chrome dibujan su
        // propia ✕ encima de la nuestra, con otro estilo y sin área de toque.
        className="min-h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-9 pr-9 text-sm text-zinc-100 transition-colors placeholder:text-zinc-600 hover:border-zinc-700 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 [&::-webkit-search-cancel-button]:hidden"
      />

      {value !== "" && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}
