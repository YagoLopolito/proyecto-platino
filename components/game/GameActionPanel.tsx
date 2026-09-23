"use client";

import { useOptimistic, useState, useTransition } from "react";
import AddDiaryEntryForm from "@/components/diary/AddDiaryEntryForm";
import { GameScore } from "@/components/diary/GameScore";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { Modal } from "@/components/Modal";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon, type IconName } from "@/components/ui/Icon";
import { FormError } from "@/components/FormError";
import { startPlaying, stopPlaying } from "@/lib/now-playing/actions";
import { addToPlaylist, removeFromPlaylist } from "@/lib/playlist/actions";

/**
 * Toggle de la barra de acciones (Jugando / Playlist / Lista). `aria-pressed`
 * es el estado visible para un lector de pantalla; a la vista, el activo va en
 * `accent-ink` con el ícono relleno de fondo, como el resto de los activos.
 *
 * Sin `onClick` va deshabilitado con la aclaración en `hint`: Lista (#189)
 * llega con su sub-issue, y así la ficha ya tiene su forma final y nadie
 * piensa que el botón "no hace nada".
 */
function ActionToggle({
  icon,
  label,
  hint,
  pressed = false,
  pending = false,
  onClick,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  pressed?: boolean;
  pending?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={!onClick || pending}
      title={hint}
      onClick={onClick}
      className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-chip px-2 py-2 type-caption transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink disabled:cursor-not-allowed ${
        !onClick
          ? "text-ink-faint"
          : pressed
            ? "font-semibold text-accent-ink hover:bg-surface-hover"
            : "text-ink-muted hover:bg-surface-hover hover:text-ink"
      }`}
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
  isPlaying,
  friendsPlaying,
  inPlaylist,
  friendsWithInPlaylist,
  ownRating,
  ownEntriesCount,
  community,
}: {
  gameId: string;
  /** Tenés una racha abierta de "Jugando ahora" de este juego. */
  isPlaying: boolean;
  /** Cuántas de las personas que seguís lo están jugando ahora. */
  friendsPlaying: number;
  /** El juego está en tu Playlist (#188). */
  inPlaylist: boolean;
  /** En la Playlist de cuántas de las personas que seguís está. */
  friendsWithInPlaylist: number;
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
  const [playingError, setPlayingError] = useState<string | null>(null);
  const [playingPending, startPlayingTransition] = useTransition();
  /** Aviso de un efecto colateral, como "Sacado de tu Playlist" (#188). */
  const [notice, setNotice] = useState<string | null>(null);

  // El estado que se ve es el del server (la action revalida la ficha): no se
  // lleva una copia optimista que pueda quedar desfasada si la escritura falla.
  function togglePlaying() {
    setPlayingError(null);
    setNotice(null);
    startPlayingTransition(async () => {
      const result = isPlaying ? await stopPlaying(gameId) : await startPlaying(gameId);
      if (result.error) setPlayingError(result.error);
      else if (result.removedFromPlaylist) setNotice("Sacado de tu Playlist.");
    });
  }

  // La Playlist sí es optimista (lo pide el issue #188): agregar un juego es
  // un gesto de un toque y tiene que responder al instante. Si la action falla,
  // `useOptimistic` vuelve solo al valor del server al terminar la transición,
  // y se muestra el error: ese es el rollback.
  const [optimisticInPlaylist, setOptimisticInPlaylist] = useOptimistic(inPlaylist);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [, startPlaylistTransition] = useTransition();

  function togglePlaylist() {
    setPlaylistError(null);
    setNotice(null);
    const next = !optimisticInPlaylist;
    startPlaylistTransition(async () => {
      setOptimisticInPlaylist(next);
      const result = next ? await addToPlaylist(gameId) : await removeFromPlaylist(gameId);
      if (result.error) setPlaylistError(result.error);
    });
  }
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
      <div className="space-y-1.5">
        <div className="flex gap-1">
          <ActionToggle
            icon="gamepad"
            label="Jugando"
            hint={isPlaying ? "Dejé de jugarlo" : "Marcar como jugando"}
            pressed={isPlaying}
            pending={playingPending}
            onClick={togglePlaying}
          />
          <ActionToggle
            icon={optimisticInPlaylist ? "playlist-check" : "playlist-add"}
            label="Playlist"
            hint={optimisticInPlaylist ? "Sacar de tu Playlist" : "Agregar a tu Playlist"}
            pressed={optimisticInPlaylist}
            onClick={togglePlaylist}
          />
          <ActionToggle icon="list" label="Lista" hint="Llega con las listas (#189)." />
        </div>
        <FormError>{playingError ?? playlistError}</FormError>
        {notice && (
          <p role="status" className="text-center type-caption text-ink-muted">
            {notice}
          </p>
        )}
        {friendsPlaying > 0 && (
          <p className="flex items-center justify-center gap-1.5 type-caption text-ink-muted">
            <Icon name="users" className="h-3.5 w-3.5 text-ink-faint" />
            {friendsPlaying === 1
              ? "1 amigo lo está jugando"
              : `${friendsPlaying} amigos lo están jugando`}
          </p>
        )}
        {friendsWithInPlaylist > 0 && (
          <p className="flex items-center justify-center gap-1.5 type-caption text-ink-muted">
            <Icon name="playlist-check" className="h-3.5 w-3.5 text-ink-faint" />
            {friendsWithInPlaylist === 1
              ? "Está en la Playlist de 1 amigo"
              : `Está en la Playlist de ${friendsWithInPlaylist} amigos`}
          </p>
        )}
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
