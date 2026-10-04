"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

/**
 * Modal de una ruta interceptada (`app/(app)/@modal/(.)publicaciones/...`):
 * la URL es la de la publicación, así que se puede compartir y recargar (y ahí
 * se abre como página). Cerrar es volver atrás en el historial.
 *
 * - Escritorio: panel ancho centrado sobre la pantalla anterior.
 * - Mobile: pantalla completa (un modal flotante en 360px no deja lugar).
 *
 * Focus trap propio: a diferencia de `Modal`, éste puede tener un carrusel,
 * videos y un formulario de comentarios adentro, y el Tab no tiene que
 * escaparse a la página de atrás.
 */
export function RouteModal({
  title,
  children,
  size = "wide",
  onBeforeClose,
}: {
  title: string;
  children: ReactNode;
  /** `wide` para el detalle (archivo | comentarios), `form` para el compositor. */
  size?: "wide" | "form";
  /** Si devuelve false, no se cierra (p. ej. una subida en curso). */
  onBeforeClose?: () => boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onBeforeCloseRef = useRef(onBeforeClose);
  useEffect(() => {
    onBeforeCloseRef.current = onBeforeClose;
  }, [onBeforeClose]);

  // Efectos del browser al abrir: foco inicial, Escape, Tab atrapado, scroll
  // del body bloqueado. Dependen de nada: el modal se monta abierto.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog.focus();

    function close() {
      if (onBeforeCloseRef.current && !onBeforeCloseRef.current()) return;
      router.back();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Un Escape adentro de un campo con texto sólo sale del campo.
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [router]);

  function requestClose() {
    if (onBeforeClose && !onBeforeClose()) return;
    router.back();
  }

  const panel =
    size === "wide" ? "md:max-w-6xl md:h-[min(90vh,56rem)]" : "md:max-w-4xl md:max-h-[90vh]";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/80 md:items-center md:p-6">
      {/* Backdrop: redundante con la ✕ y con Escape, fuera del orden de tabulación. */}
      <div className="absolute inset-0 hidden md:block" aria-hidden="true" onClick={requestClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative z-10 flex w-full flex-col overflow-hidden bg-surface-raised focus:outline-none md:rounded-card md:border md:border-border ${panel}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2 pt-safe">
          <h2 id={titleId} className="type-subtitle text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-chip text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
