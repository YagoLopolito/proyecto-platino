"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/ui/Icon";
import { usePlatinum } from "./PlatinumProvider";
import { PLATINUM_SOUND_VOLUME } from "@/lib/platinum/assets";
import { playPlatinumSound } from "@/lib/platinum/sound";
import type { PlatinumPiece } from "@/lib/platinum/stats";

// El canvas y su lógica sólo se bajan en un juego platinado, nunca en el
// bundle de las demás pantallas.
const PlatinumRain = dynamic(() => import("./PlatinumRain"), { ssr: false });

/**
 * La lluvia de platinos de la ficha y sus botones.
 *
 * Se dispara cada vez que se entra a un juego platinado: este componente vive
 * en el `layout.tsx` de la ficha, que no se vuelve a montar al cambiar de tab,
 * así que es "al entrar al juego" y no "al cambiar de tab". Espera a tener las
 * preferencias del servidor (`ready`): con los efectos apagados o
 * `prefers-reduced-motion` no hay lluvia; con el sonido apagado no suena.
 *
 * El sonido suena siempre que se entra (más bajo que en la celebración). Si el
 * navegador lo bloquea por autoplay (entrada directa por URL, sin un toque
 * antes), simplemente no suena: "¡Otra vez!" es un toque y ahí sí suena.
 */
export function GamePlatinumActions({ piece }: { piece: PlatinumPiece }) {
  const { prefs, ready, motion, openShare } = usePlatinum();
  const [run, setRun] = useState<{ id: number; raining: boolean } | null>(null);

  // La primera lluvia, en cuanto llegan las preferencias. Comparado durante el
  // render (no con un setState en un effect, ver Convenciones en CLAUDE.md).
  if (ready && run === null) {
    setRun({ id: 1, raining: motion });
  }

  const runId = run?.id ?? 0;
  // El sonido es un efecto externo; corre una vez por lluvia.
  useEffect(() => {
    if (runId === 0 || !prefs.sound) return;
    void playPlatinumSound(PLATINUM_SOUND_VOLUME.rain);
  }, [runId, prefs.sound]);

  return (
    // En mobile los dos botones se reparten el ancho; desde `sm`, a su tamaño.
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      {/* Sin efectos ni sonido no hay nada que repetir. */}
      {(motion || prefs.sound) && (
        <Button
          variant="secondary"
          onClick={() => setRun((current) => ({ id: (current?.id ?? 0) + 1, raining: motion }))}
        >
          <Icon name="repeat" className="h-4 w-4" />
          ¡Otra vez!
        </Button>
      )}
      <Button
        variant="secondary"
        onClick={() => openShare(piece)}
        aria-label="Compartir en actividad"
        // Sin "¡Otra vez!" (efectos y sonido apagados) ocupa la fila entera.
        className={motion || prefs.sound ? undefined : "col-span-2"}
      >
        <Icon name="upload" className="h-4 w-4" />
        {/* "en actividad" no entra al lado de "¡Otra vez!" en un celular. */}
        Compartir<span className="hidden sm:inline"> en actividad</span>
      </Button>
      {run?.raining && (
        <PlatinumRain
          key={run.id}
          intensity="soft"
          onDone={() => setRun((current) => (current ? { ...current, raining: false } : current))}
        />
      )}
    </div>
  );
}
