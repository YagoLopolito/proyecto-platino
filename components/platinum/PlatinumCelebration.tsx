"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button, buttonClassName } from "@/components/Button";
import { Icon } from "@/components/ui/Icon";
import { PlatinumTrophy } from "./PlatinumTrophy";
import { PLATINUM_SOUND_VOLUME } from "@/lib/platinum/assets";
import { playPlatinumSound, type SoundOutcome } from "@/lib/platinum/sound";
import { formatEarnedRate, formatPlatinumDate } from "@/lib/platinum/stats";
import type { PlatinumCelebrationItem } from "@/lib/platinum/types";

const PlatinumRain = dynamic(() => import("./PlatinumRain"), { ssr: false });

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Celebración de pantalla completa de un platino nuevo: el trofeo entra desde
 * chico con un destello, la lluvia intensa cae detrás y suena el sonido de
 * platino. La monta `PlatinumProvider`, uno por vez ("1 de 3").
 *
 * Es un diálogo modal accesible: foco atrapado adentro, Esc y click afuera
 * cierran, y al cerrar el foco vuelve a donde estaba. Si el navegador bloquea
 * el audio (autoplay), la celebración sigue igual y aparece un botón para
 * reproducirlo.
 */
export default function PlatinumCelebration({
  item,
  position,
  total,
  motion,
  sound,
  onClose,
  onShare,
}: {
  item: PlatinumCelebrationItem;
  position: number;
  total: number;
  motion: boolean;
  sound: boolean;
  onClose: () => void;
  onShare: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLAnchorElement>(null);
  const [raining, setRaining] = useState(motion);
  const [soundOutcome, setSoundOutcome] = useState<SoundOutcome | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Foco, Esc, foco atrapado y scroll del body: efectos del navegador.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, []);

  // El sonido es un efecto externo; el resultado llega async.
  useEffect(() => {
    if (!sound) return;
    let cancelled = false;
    void playPlatinumSound(PLATINUM_SOUND_VOLUME.celebration).then((outcome) => {
      if (!cancelled) setSoundOutcome(outcome);
    });
    return () => {
      cancelled = true;
    };
  }, [sound]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4">
      {/* Backdrop: cerrar al tocar afuera. Redundante con Esc y "Cerrar". */}
      <div className="absolute inset-0 bg-black/85" aria-hidden="true" onClick={onClose} />

      {raining && (
        <PlatinumRain
          intensity="intense"
          className="absolute inset-0"
          onDone={() => setRaining(false)}
        />
      )}

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 my-auto flex w-full max-w-md flex-col items-center gap-5 rounded-card border border-platinum-deep/60 bg-surface-raised px-5 pb-6 pt-8 text-center shadow-2xl shadow-black/60"
      >
        {total > 1 && (
          <p className="absolute left-4 top-3 type-overline text-ink-faint">
            {position} de {total}
          </p>
        )}

        <div className="relative flex h-44 w-44 items-center justify-center">
          <span
            aria-hidden="true"
            className="platinum-pulse absolute inset-2 rounded-full bg-platinum-glow blur-2xl"
          />
          <span
            aria-hidden="true"
            className="platinum-flash absolute inset-0 rounded-full bg-platinum-light/70 blur-xl"
          />
          <span className="platinum-enter relative">
            <PlatinumTrophy size={160} priority />
          </span>
        </div>

        <div className="space-y-2">
          <h2 id={titleId} className="type-overline tracking-[0.2em] text-trophy-platinum">
            ¡Platino desbloqueado!
          </h2>
          <p className="type-display text-ink">{item.name}</p>
          <p className="type-meta text-ink-muted">
            Tu platino <span className="font-semibold text-ink">#{item.number}</span> ·{" "}
            {formatPlatinumDate(item.unlockedAt)}
            {item.earnedRate !== null && (
              <> · Lo tiene el {formatEarnedRate(item.earnedRate)} de los jugadores</>
            )}
          </p>
        </div>

        {soundOutcome === "blocked" && (
          <button
            type="button"
            onClick={() => {
              void playPlatinumSound(PLATINUM_SOUND_VOLUME.celebration).then(setSoundOutcome);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-chip px-3 type-meta text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          >
            <Icon name="volume" className="h-4 w-4" />
            Reproducir sonido
          </button>
        )}

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            ref={primaryRef}
            href={`/vitrina#platino-${item.gameId}`}
            onClick={onClose}
            className={buttonClassName("primary")}
          >
            Ver en la vitrina
          </Link>
          <Button variant="secondary" onClick={onShare}>
            Compartir en actividad
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {position < total ? "Siguiente" : "Cerrar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
