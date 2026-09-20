import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

/*
 * `border-strong` y no `border`: el borde de un campo es el borde de un
 * control interactivo y le corresponden 3:1 contra el fondo adyacente (WCAG
 * 1.4.11). El hairline `border` es para separar, no para delimitar un control.
 *
 * El fondo es `surface-raised` -- un escalón por encima de la tarjeta donde
 * suele vivir el formulario -- para que el campo se lea como un hueco y no se
 * funda con el contenedor.
 */
const fieldClassName =
  "w-full min-h-11 rounded-card border border-border-strong bg-surface-raised px-3 py-2 type-body text-ink placeholder:text-ink-faint sm:min-h-0 focus:border-accent-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${fieldClassName} ${className}`} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...props }, ref) {
  return <textarea ref={ref} className={`${fieldClassName} ${className}`} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", ...props }, ref) {
    return <select ref={ref} className={`${fieldClassName} ${className}`} {...props} />;
  },
);

export function Label({ className = "", ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`type-meta text-ink-muted ${className}`} {...props} />;
}
