import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-500",
  secondary: "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200",
  danger: "border border-zinc-700 text-zinc-400 hover:border-red-500 hover:text-red-400",
  ghost: "text-zinc-500 hover:text-blue-400",
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
      className={`rounded px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
