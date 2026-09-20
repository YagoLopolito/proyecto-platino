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
      className={`inline-flex items-center rounded-card border border-border-strong bg-surface p-0.5 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-chip px-3 type-caption font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 sm:min-h-9 ${
              active
                ? // El marco interno del activo va con `accent-ink`: es un
                  // borde de control y le toca 3:1 (WCAG 1.4.11), que el
                  // acento de relleno no alcanza sobre superficie oscura.
                  "bg-accent/15 text-accent-ink shadow-[inset_0_0_0_1px_var(--color-accent-ink)]"
                : "text-ink-muted hover:bg-surface-hover hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
