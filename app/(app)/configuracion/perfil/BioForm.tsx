"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/Button";
import { Textarea } from "@/components/Input";
import { MAX_BIO_LENGTH } from "@/lib/profile/constants";
import { saveBio, type BioActionState } from "./actions";

const INITIAL_STATE: BioActionState = { error: null, success: null };

/** Editor de la bio: un campo con contador y el guardado como Server Action. */
export function BioForm({ initialBio }: { initialBio: string | null }) {
  const [state, action, pending] = useActionState(saveBio, INITIAL_STATE);
  const [value, setValue] = useState(initialBio ?? "");

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="bio" className="type-meta font-medium text-ink">
          Bio
        </label>
        <Textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={MAX_BIO_LENGTH}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Cazador de platinos, fan de los soulslike…"
          aria-describedby="bio-count"
        />
        <p id="bio-count" className="type-caption text-ink-faint">
          {value.length} / {MAX_BIO_LENGTH}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar bio"}
        </Button>
        {state.error && (
          <p role="alert" className="type-meta text-danger">
            {state.error}
          </p>
        )}
        {state.success && (
          <p role="status" className="type-meta text-success">
            {state.success}
          </p>
        )}
      </div>
    </form>
  );
}
