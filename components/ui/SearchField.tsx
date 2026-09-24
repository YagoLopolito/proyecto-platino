"use client";

import { useId } from "react";

import { Icon } from "@/components/ui/Icon";

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
  name,
  autoFocus,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Etiqueta accesible: el campo no tiene `<label>` visible. */
  label: string;
  /** Para mandarlo en un `<form method="get">` (la búsqueda de `/buscar`). */
  name?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const id = useId();

  return (
    <div className={`relative ${className}`}>
      <Icon
        name="search"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
      />

      <input
        id={id}
        type="search"
        name={name}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        // `[&::-webkit-search-cancel-button]:hidden`: Safari/Chrome dibujan su
        // propia ✕ encima de la nuestra, con otro estilo y sin área de toque.
        className="min-h-11 w-full rounded-card border border-border-strong bg-surface pl-9 pr-9 type-meta text-ink transition-colors placeholder:text-ink-faint hover:border-ink-faint focus:border-accent-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 [&::-webkit-search-cancel-button]:hidden"
      />

      {value !== "" && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
