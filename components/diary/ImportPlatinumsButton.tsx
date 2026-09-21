"use client";

import { useActionState } from "react";
import { importPlatinumsToDiary, type BackfillState } from "@/app/(app)/diario/actions";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";
import { Icon } from "@/components/ui/Icon";

const initialState: BackfillState = { error: null, message: null };

/** Trae al diario los platinos ya sincronizados que no tienen entrada todavía. */
export default function ImportPlatinumsButton() {
  const [state, formAction, pending] = useActionState(importPlatinumsToDiary, initialState);

  return (
    <form action={formAction} className="shrink-0 space-y-1">
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        className="gap-1.5 whitespace-nowrap"
      >
        <Icon name="trophy" className="h-4 w-4" />
        {pending ? "Importando..." : "Importar mis platinos y 100%"}
      </Button>
      <FormError>{state.error}</FormError>
      {state.message && <p className="type-caption text-ink-muted">{state.message}</p>}
    </form>
  );
}
