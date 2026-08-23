"use client";

import { useState } from "react";
import CatalogSearchCombobox from "@/components/diary/CatalogSearchCombobox";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";

/**
 * "Marcar como terminado" vive dentro de /diario como modal (antes era la
 * página /diario/nuevo). `defaultOpen` es para entrar directo con el modal
 * abierto desde un link (`/diario?nuevo=1`).
 */
export default function MarkAsFinishedModal({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="w-full py-2 sm:w-auto sm:py-1.5"
      >
        ✓ Marcar terminado
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Marcar como terminado"
        description="Buscá el juego que terminaste. Si no está en tu biblioteca, lo agregamos desde el catálogo externo (RAWG)."
      >
        <CatalogSearchCombobox />
      </Modal>
    </>
  );
}
