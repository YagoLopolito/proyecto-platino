"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { setListLike, setReviewLike } from "@/lib/likes/actions";

export interface LikeButtonProps {
  kind: "review" | "list";
  targetId: string;
  liked: boolean;
  count: number;
  /** Nombre accesible del toggle: "Me gusta la reseña de X". */
  label: string;
}

/**
 * El corazón de los likes (epic #183, issue #190), en el token `like`.
 *
 * Optimista, como el toggle de la Playlist: un me gusta es un gesto de un
 * toque. El valor confirmado se guarda en estado local al volver la action
 * -- no depende de que la revalidación llegue a esta pantalla -- y si la
 * action falla, `useOptimistic` vuelve solo al último valor confirmado.
 */
export function LikeButton({ kind, targetId, liked, count, label }: LikeButtonProps) {
  const [confirmed, setConfirmed] = useState({ liked, count });
  // Si el server trae otro valor (otra persona likeó, o la revalidación),
  // manda el server: se ajusta durante el render, no en un effect.
  const [prevProps, setPrevProps] = useState({ liked, count });
  if (prevProps.liked !== liked || prevProps.count !== count) {
    setPrevProps({ liked, count });
    setConfirmed({ liked, count });
  }

  const [optimistic, setOptimistic] = useOptimistic(confirmed);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = {
      liked: !optimistic.liked,
      count: Math.max(0, optimistic.count + (optimistic.liked ? -1 : 1)),
    };
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      const result =
        kind === "review"
          ? await setReviewLike(targetId, next.liked)
          : await setListLike(targetId, next.liked);
      if (result.error) setError(result.error);
      else setConfirmed(next);
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        aria-pressed={optimistic.liked}
        aria-label={label}
        onClick={toggle}
        className={`-m-2 flex h-11 w-11 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink sm:h-9 sm:w-9 ${
          optimistic.liked ? "text-like" : "text-ink-faint hover:text-like"
        }`}
      >
        <Icon name={optimistic.liked ? "heart" : "heart-outline"} className="h-4 w-4" />
      </button>
      <LikeCountText count={optimistic.count} />
      {error && (
        <span role="alert" className="type-caption text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

function LikeCountText({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="type-caption tabular-nums text-ink-muted">
      {count}
      <span className="sr-only"> me gusta</span>
    </span>
  );
}

/**
 * Sólo el contador, sin toggle: lo tuyo (no se likea lo propio) y lo que va
 * adentro de un link (una tarjeta, un póster), donde un botón sería HTML
 * inválido. Sin likes no se muestra nada.
 */
export function LikeCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 type-caption tabular-nums text-ink-muted">
      <Icon name="heart" className="h-3.5 w-3.5 text-like" />
      {count}
      <span className="sr-only"> me gusta</span>
    </span>
  );
}
