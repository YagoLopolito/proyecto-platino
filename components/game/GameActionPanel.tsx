"use client";

import { useState } from "react";
import AddDiaryEntryForm from "@/components/diary/AddDiaryEntryForm";
import { GameScore } from "@/components/diary/GameScore";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { Modal } from "@/components/Modal";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Toggle de la barra de acciones (Jugando / Playlist / Lista). `aria-pressed`
 * es el estado visible para un lector de pantalla.
 *
 * Los tres llegan con sus sub-issues (#187 Jugando ahora, #188 Playlist, #189
 * Listas): hasta entonces van deshabilitados y con la aclaración, para que la
 * ficha ya tenga su forma final y nadie piense que el botón "no hace nada".
 */
function ActionToggle({ icon, label, hint }: { icon: IconName; label: string; hint: string }) {
  return (
    <button
      type="button"
      aria-pressed={false}
      disabled
      title={hint}
      className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 type-caption text-ink-faint disabled:cursor-not-allowed"
    >
      <Icon name={icon} className="h-6 w-6" />
      {label}
    </button>
  );
}

const DIALOG_TITLE = "Registrar o puntuar";

/**
 * Panel de acciones de la ficha de juego (epic #183, issue #186), el de la
 * ficha de una película en Letterboxd con nuestras acciones: Jugando ·
 * Playlist · Lista, tu puntuación, "Registrar o puntuar" y el score de la
 * comunidad con su histograma.
 *
 * En escritorio es la tercera columna del hero (`surface-raised`: flota sobre
 * el backdrop). En mobile va debajo de los datos, a lo ancho, y "Registrar o
 * puntuar" abre una hoja desde abajo en vez de un modal -- mismo patrón que el
 * + de la barra inferior (`RegisterLauncher`): dos disparadores, uno por
 * breakpoint, cada uno con su diálogo.
 */
export function GameActionPanel({
  gameId,
  ownRating,
  ownEntriesCount,
  community,
}: {
  gameId: string;
  /** Tu última puntuación (escala 0-10), si tenés alguna. */
  ownRating: number | null;
  ownEntriesCount: number;
  community: {
    averageRating: number | null;
    ratingCount: number;
    /** Votos por cantidad de estrellas, de 1 a 5. */
    distribution: number[];
  } | null;
}) {
  const [dialog, setDialog] = useState<"sheet" | "modal" | null>(null);
  const close = () => setDialog(null);
  const totalVotes = community?.distribution.reduce((sum, count) => sum + count, 0) ?? 0;
  const maxBucket = Math.max(1, ...(community?.distribution ?? [0]));

  const triggerClass =
    "flex min-h-11 w-full items-center justify-center gap-2 rounded-chip bg-accent px-3 type-meta font-semibold text-white transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised";

  return (
    <section
      aria-label="Acciones"
      className="space-y-4 rounded-card border border-border bg-surface-raised p-3"
    >
      <div className="flex divide-x divide-border">
        <ActionToggle icon="gamepad" label="Jugando" hint="Llega con “Jugando ahora” (#187)." />
        <ActionToggle icon="clock" label="Playlist" hint="Llega con la Playlist (#188)." />
        <ActionToggle icon="list" label="Lista" hint="Llega con las listas (#189)." />
      </div>

      {ownRating !== null && (
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="type-overline text-ink-faint">Tu puntuación</span>
          <StarRatingDisplay rating={ownRating} tone="own" />
        </div>
      )}

      <div>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setDialog("sheet")}
          className={`${triggerClass} sm:hidden`}
        >
          <Icon name="plus" className="h-4 w-4" />
          {DIALOG_TITLE}
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setDialog("modal")}
          className={`${triggerClass} hidden sm:flex`}
        >
          <Icon name="plus" className="h-4 w-4" />
          {DIALOG_TITLE}
        </button>
        {ownEntriesCount > 0 && (
          <p className="mt-1.5 text-center type-caption text-ink-faint">
            {ownEntriesCount === 1
              ? "Ya registraste una partida."
              : `Ya registraste ${ownEntriesCount} partidas.`}
          </p>
        )}
      </div>

      {community && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="type-overline text-ink-faint">Puntuación de la comunidad</p>
          <GameScore
            score={{ average_rating: community.averageRating, rating_count: community.ratingCount }}
          />
          {totalVotes > 0 && (
            // Histograma en el oro de la comunidad (#184): ni el azul de tu
            // puntuación ni el gris de la de otro.
            <ul className="flex items-end gap-1 pt-1" aria-label="Distribución de valoraciones">
              {community.distribution.map((count, index) => (
                <li key={index} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-trophy-gold"
                    style={{ height: `${Math.max(2, (count / maxBucket) * 40)}px` }}
                    title={`${index + 1} estrellas: ${count}`}
                  />
                  <span className="flex items-center gap-0.5 type-caption text-ink-faint">
                    {index + 1}
                    <Icon name="star" className="h-2.5 w-2.5" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <BottomSheet open={dialog === "sheet"} onClose={close} title={DIALOG_TITLE}>
        <AddDiaryEntryForm gameId={gameId} />
      </BottomSheet>
      <Modal open={dialog === "modal"} onClose={close} title={DIALOG_TITLE}>
        <AddDiaryEntryForm gameId={gameId} />
      </Modal>
    </section>
  );
}
