"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CatalogSearchCombobox from "@/components/diary/CatalogSearchCombobox";
import { Button } from "@/components/Button";

/**
 * "Marcar como terminado" vive dentro de /diario como modal (antes era la
 * página /diario/nuevo). `defaultOpen` es para entrar directo con el modal
 * abierto desde un link (`/diario?nuevo=1`).
 */
export default function MarkAsFinishedModal({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Efectos imperativos del browser (tecla Escape, scroll del body, foco
  // inicial), no sincronización de estado -- por eso van en un effect.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        ✓ Marcar terminado
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center">
          {/* Backdrop: cerrar al clickear afuera. Es redundante con el botón
              "Cerrar" y con Escape, por eso queda oculto para lectores de
              pantalla en vez de ser un control extra en el tab order. */}
          <div className="absolute inset-0" aria-hidden="true" onClick={close} />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mark-as-finished-title"
            className="relative z-10 my-auto w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-950 p-4 sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 id="mark-as-finished-title" className="text-lg font-semibold text-zinc-50">
                  Marcar como terminado
                </h2>
                <p className="text-sm text-zinc-400">
                  Buscá el juego que terminaste. Si no está en tu biblioteca, lo agregamos desde el
                  catálogo externo (RAWG).
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={close}
                aria-label="Cerrar"
                className="shrink-0 rounded px-2 py-1 text-sm text-zinc-400 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                ✕
              </button>
            </div>

            <div className="mt-6">
              <CatalogSearchCombobox />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
