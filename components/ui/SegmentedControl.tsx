"use client";

/**
 * Control segmentado: un solo marco con las opciones adentro, en vez de N
 * píldoras sueltas flotando en la pantalla.
 *
 * Por qué reemplaza a los chips: tres o cuatro chips independientes se leen
 * como tres botones sin relación entre sí (y con el activo en otro color,
 * como un error). Un segmentado dice "de acá elegís uno" con la forma, que es
 * lo que hacen las apps nativas y la referencia de diseño de la app.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Etiqueta accesible del grupo. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex items-center rounded-lg border border-zinc-800 bg-zinc-950 p-0.5 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:min-h-9 ${
              active
                ? "bg-accent/15 text-accent shadow-[inset_0_0_0_1px_var(--color-accent)]"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
