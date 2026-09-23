"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";
import { deleteList } from "@/lib/lists/actions";

/**
 * Borrar una lista, con confirmación en dos pasos en la misma línea (no un
 * `confirm()` del navegador, que en la app instalada se ve como del sistema).
 */
export function DeleteListButton({ listId, title }: { listId: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
        Borrar lista
      </Button>
    );
  }

  return (
    <div role="alertdialog" aria-label="Confirmar borrado" className="space-y-2">
      <p className="type-body text-ink">
        ¿Borrar “{title}”? No se puede deshacer; los juegos no se tocan.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteList(listId);
              if (result.error) {
                setError(result.error);
                return;
              }
              router.push("/perfil/listas");
            })
          }
        >
          {pending ? "Borrando..." : "Sí, borrar"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
          No, dejarla
        </Button>
      </div>
      <FormError>{error}</FormError>
    </div>
  );
}
