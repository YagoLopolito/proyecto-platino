"use client";

import { useState, useTransition } from "react";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { usePlatinum } from "@/components/platinum/PlatinumProvider";
import type { PlatinumPrefs } from "@/lib/platinum/types";
import { savePlatinumPrefs } from "./actions";

/**
 * Sonido y efectos del platino. Cada toque guarda solo (no hay botón
 * "Guardar"): es optimista y, si falla, vuelve al valor anterior. El
 * `PlatinumProvider` se actualiza en el momento, así el cambio se ve sin
 * recargar (el CSS de los reflejos lee `data-platinum-fx` de `<html>`).
 */
export function PlatinumPrefsForm({ initial }: { initial: PlatinumPrefs }) {
  const { setPrefs } = usePlatinum();
  const [prefs, setLocal] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(next: PlatinumPrefs) {
    const previous = prefs;
    setLocal(next);
    setPrefs(next);
    setError(null);
    startTransition(async () => {
      const result = await savePlatinumPrefs(next);
      if (result.error) {
        setLocal(previous);
        setPrefs(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3" aria-busy={pending}>
      <div className="flex flex-wrap gap-2">
        <ToggleChip checked={prefs.effects} onChange={(effects) => update({ ...prefs, effects })}>
          Efectos visuales
        </ToggleChip>
        <ToggleChip checked={prefs.sound} onChange={(sound) => update({ ...prefs, sound })}>
          Sonido de platino
        </ToggleChip>
      </div>
      <p className="type-caption text-ink-faint">
        Sin efectos, los platinos se siguen destacando con su marco y su trofeo, pero sin lluvia ni
        reflejos. Si tu sistema pide reducir el movimiento, los efectos se apagan igual.
      </p>
      {error && (
        <p role="alert" className="type-meta text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
