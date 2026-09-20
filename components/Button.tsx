import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

/*
 * Todo color sale de un token de `app/globals.css` (issue #176 §3.1): no hay
 * `blue-600` ni `zinc-500` acá. Los nombres de token ya llevan el rol, así que
 * las razones de accesibilidad que antes estaban en cada clase viven ahora en
 * la definición del token:
 *
 * - `accent` es el relleno y `accent-hover` va más OSCURO, no más claro, para
 *   que el texto blanco de encima no caiga por debajo de 4.5:1.
 * - `border-strong` (y no `border`) porque el borde de un control interactivo
 *   tiene que llegar a 3:1 contra el fondo (WCAG 1.4.11); `border` es el
 *   hairline de separación, que se intuye y no se lee.
 * - el anillo de foco usa `accent-ink`, que es el acento pensado para verse
 *   sobre superficie oscura.
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "border border-border-strong text-ink-muted hover:border-ink-muted hover:text-ink",
  danger: "border border-border-strong text-ink-muted hover:border-danger hover:text-danger",
  ghost: "text-ink-muted hover:text-accent-ink",
};

export function Button({
  variant = "primary",
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex min-h-11 items-center justify-center rounded-chip px-3 py-1.5 type-meta font-medium transition-colors sm:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
