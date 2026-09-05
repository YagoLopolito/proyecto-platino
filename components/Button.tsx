import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // hover:bg-blue-700 (no blue-500) porque blue-500 con texto blanco encima
  // no llega a 4.5:1 de contraste (WCAG AA para texto normal).
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  // border-zinc-500 (no zinc-700) porque zinc-700 no llega a 3:1 contra el
  // fondo, el mínimo WCAG para el borde de un control interactivo.
  secondary: "border border-zinc-500 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200",
  danger: "border border-zinc-500 text-zinc-400 hover:border-red-500 hover:text-red-400",
  ghost: "text-zinc-400 hover:text-blue-400",
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
      className={`inline-flex min-h-11 items-center justify-center rounded px-3 py-1.5 text-sm font-medium transition-colors sm:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
