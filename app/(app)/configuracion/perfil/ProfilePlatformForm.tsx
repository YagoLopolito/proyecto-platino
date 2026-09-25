"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import type { ProfilePlatform } from "@/lib/profile/constants";
import { saveProfilePlatform, type ProfilePlatformActionState } from "./actions";

const INITIAL_STATE: ProfilePlatformActionState = { error: null, success: null };

/**
 * Con qué cuenta se muestra el perfil (nombre y foto). Sólo se monta con PSN y
 * Steam conectadas: con una sola no hay nada que elegir.
 */
export function ProfilePlatformForm({
  current,
  psnName,
  steamName,
}: {
  current: ProfilePlatform;
  psnName: string;
  steamName: string;
}) {
  const [state, action, pending] = useActionState(saveProfilePlatform, INITIAL_STATE);

  return (
    <form action={action} className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="type-meta font-medium text-ink">Mostrar mi perfil como</legend>
        {(
          [
            { value: "psn", label: `PSN · ${psnName}` },
            { value: "steam", label: `Steam · ${steamName}` },
          ] as const
        ).map((option) => (
          <label key={option.value} className="flex items-center gap-2 type-body text-ink">
            <input
              type="radio"
              name="platform"
              value={option.value}
              defaultChecked={current === option.value}
              className="accent-accent"
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
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
