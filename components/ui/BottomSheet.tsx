"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

/**
 * Hoja que sube desde abajo (epic #183, issue #185): el patrón de las
 * acciones rápidas en mobile, al alcance del pulgar, como el sheet del + de
 * Letterboxd. Mismo contrato que `Modal` -- el que lo usa maneja `open`, cierra
 * con Escape, con la ✕ o tocando afuera, y bloquea el scroll del body -- pero
 * anclado al borde de abajo en vez de centrado.
 *
 * En escritorio no se usa: ahí el mismo contenido va en un `Modal` (ver
 * `RegisterLauncher`). Una hoja pegada abajo en una pantalla de 1440px queda
 * lejos de todo.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // Misma razón que en `Modal`: `onClose` suele ser una arrow inline y cambia
  // de identidad en cada render; sin el ref, los effects se re-ejecutarían y el
  // foco volvería a la ✕ con cada tecla.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      {/* Backdrop: tocar afuera cierra. Redundante con la ✕ y Escape, por eso
          fuera del árbol de accesibilidad. */}
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // `surface-raised` porque flota sobre todo; `pb-safe` para despejar la
        // barra de gestos del iPhone. Tope de alto con scroll propio: el
        // buscador de "Registrar terminado" puede traer varios resultados.
        className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-card border border-b-0 border-border bg-surface-raised pb-safe motion-safe:animate-[sheet-up_180ms_ease-out]"
      >
        {/* El "asa" dice que es una hoja, no un modal cualquiera. Decorativa. */}
        <span
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong"
        />
        <div className="flex items-center justify-between gap-4 px-4 pt-2">
          <h2 id={titleId} className="type-subtitle text-ink">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-chip text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-4 pt-2">{children}</div>
      </div>
    </div>
  );
}
