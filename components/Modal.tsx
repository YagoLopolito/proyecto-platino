"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Modal simple con overlay: cierra con Escape, con la ✕ o clickeando el fondo,
 * y bloquea el scroll del body mientras está abierto. El que lo usa maneja el
 * estado `open` (así puede abrirse desde un botón, un link con query param,
 * etc.).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // `onClose` suele venir como arrow inline desde el que usa el modal, así que
  // cambia de identidad en CADA render del padre. Guardarla en un ref deja que
  // los effects de abajo dependan solo de `open`: sin esto, el effect del foco
  // se volvía a correr con cada tecla tipeada adentro del modal y devolvía el
  // foco a la ✕, sacando al usuario del campo (y cerrando el teclado en
  // mobile).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Efectos imperativos del browser (tecla Escape, scroll del body), no
  // sincronización de estado -- por eso van en un effect.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // El foco inicial va en su propio effect y depende SOLO de `open`: es algo
  // que pasa una vez, al abrir, y no cada vez que el contenido del modal se
  // vuelve a renderizar.
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center">
      {/* Backdrop: cerrar al clickear afuera. Es redundante con el botón
          "Cerrar" y con Escape, por eso queda oculto para lectores de pantalla
          en vez de ser un control extra en el tab order. */}
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 my-auto w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-950 p-4 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 id={titleId} className="text-lg font-semibold text-zinc-50">
              {title}
            </h2>
            {description && <p className="text-sm text-zinc-400">{description}</p>}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded px-2 py-1 text-sm text-zinc-400 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            ✕
          </button>
        </div>

        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
