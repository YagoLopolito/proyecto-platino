"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { GameArt } from "@/components/game/GameArt";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { LikeButton } from "@/components/likes/LikeButton";
import { Button } from "@/components/Button";
import { Icon } from "@/components/ui/Icon";
import { profileLabel } from "@/lib/friends/constants";
import { loadMoreFriendReviews } from "@/lib/friends/actions";
import type { FriendReview } from "@/lib/friends/reviews";
import { reviewFocusHref } from "@/lib/game-page/review-focus";

/**
 * Feed de Biblioteca › Reseñas (epic #183, issue #191), como la tab Reviews de
 * Letterboxd. Reemplaza a `FriendsDiaryFeed`.
 *
 * La primera página la trae el server; las siguientes se **suman** abajo con
 * "Cargar más" (Server Action + cursor). No es scroll infinito a propósito:
 * con scroll infinito el foco de teclado no tiene adónde ir y "atrás" te deja
 * en otro lugar de la lista.
 */
export function FriendReviewFeed({
  initialReviews,
  initialCursor,
}: {
  initialReviews: FriendReview[];
  initialCursor: string | null;
}) {
  const [pages, setPages] = useState({ reviews: initialReviews, cursor: initialCursor });
  // Si el server trae otra primera página (agregaste a alguien, revalidación),
  // manda el server: se ajusta durante el render, no en un effect.
  const [prevInitial, setPrevInitial] = useState(initialReviews);
  if (prevInitial !== initialReviews) {
    setPrevInitial(initialReviews);
    setPages({ reviews: initialReviews, cursor: initialCursor });
  }

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [focusId, setFocusId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Al cargar más, el foco pasa a la primera reseña nueva: si se quedara en
  // el botón (que baja con la lista), quien navega con teclado tendría que
  // volver a recorrer todo para llegar a lo que acaba de pedir.
  useEffect(() => {
    if (!focusId) return;
    listRef.current?.querySelector<HTMLElement>(`[data-review-id="${focusId}"]`)?.focus();
  }, [focusId]);

  function loadMore() {
    const cursor = pages.cursor;
    if (!cursor) return;
    setError(null);
    startTransition(async () => {
      const next = await loadMoreFriendReviews(cursor);
      if (next.status === "error") {
        setError(`No se pudieron cargar más reseñas: ${next.message}`);
        return;
      }
      const seen = new Set(pages.reviews.map((review) => review.id));
      const fresh = next.reviews.filter((review) => !seen.has(review.id));
      setPages({ reviews: [...pages.reviews, ...fresh], cursor: next.nextCursor });
      setFocusId(fresh[0]?.id ?? null);
    });
  }

  return (
    <div className="space-y-4">
      <ul ref={listRef} className="divide-y divide-border" aria-label="Reseñas de tus amigos">
        {pages.reviews.map((review) => (
          <FriendReviewRow key={review.id} review={review} />
        ))}
      </ul>

      {error && (
        <p role="alert" className="type-body text-danger">
          {error}
        </p>
      )}

      {pages.cursor && (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" onClick={loadMore} disabled={pending}>
            {pending ? "Cargando…" : "Cargar más"}
          </Button>
        </div>
      )}
    </div>
  );
}

function FriendReviewRow({ review }: { review: FriendReview }) {
  const author = profileLabel(review.author);
  const gameHref = `/juegos/${review.gameId}`;

  return (
    <li
      data-review-id={review.id}
      tabIndex={-1}
      className="space-y-2 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="min-w-0 break-words">
            <Link href={gameHref} className="type-headline text-ink hover:text-accent-ink">
              {review.gameName}
            </Link>{" "}
            {review.releaseYear && (
              <span className="type-meta tabular-nums text-ink-faint">{review.releaseYear}</span>
            )}
          </h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 type-caption text-ink-faint">
            <StarRatingDisplay rating={review.rating} tone="others" />
            {review.playthroughNumber > 1 && <span>Rejugada #{review.playthroughNumber}</span>}
            {/* El corazón es un botón suelto en la fila: ninguna parte de la
                fila es un link que lo envuelva (sería HTML inválido). */}
            <LikeButton
              kind="review"
              targetId={review.id}
              liked={review.like.liked}
              count={review.like.count}
              label={`Me gusta la reseña de ${author}`}
            />
          </div>
        </div>
        <Link
          href={`/perfil/${review.author.id}`}
          className="flex min-h-11 shrink-0 items-center gap-2 type-meta text-ink-muted hover:text-ink"
        >
          <span className="max-w-24 truncate sm:max-w-40">{author}</span>
          <FriendAvatar url={review.author.avatarUrl} name={author} size={28} />
        </Link>
      </div>

      <div className="flex items-start gap-3">
        {/* La carátula repite el link del título: fuera del orden de tabulación
            y del árbol accesible, para que el lector de pantalla no anuncie
            dos veces el mismo juego. */}
        <Link
          href={gameHref}
          tabIndex={-1}
          aria-hidden="true"
          className="relative block aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-chip border border-border bg-surface sm:w-20"
        >
          {review.imageUrl ? (
            <GameArt
              src={review.imageUrl}
              alt=""
              sizes="80px"
              className="object-cover"
              fallback={<CoverPlaceholder />}
            />
          ) : (
            <CoverPlaceholder />
          )}
        </Link>
        <ClampedReview
          text={review.review}
          readMoreHref={reviewFocusHref(review.gameId, review.id)}
          gameName={review.gameName}
        />
      </div>
    </li>
  );
}

/**
 * La reseña cortada a 6 líneas, con "Leer más" **sólo si efectivamente se
 * cortó**: se mide en el cliente (`scrollHeight` contra `clientHeight`),
 * porque cuántas líneas ocupa un texto depende del ancho de la pantalla y no
 * del largo del string.
 */
function ClampedReview({
  text,
  readMoreHref,
  gameName,
}: {
  text: string;
  readMoreHref: string;
  gameName: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setClamped(element.scrollHeight > element.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p
        ref={ref}
        className="line-clamp-6 whitespace-pre-line break-words type-review text-ink-muted"
      >
        {text}
      </p>
      {clamped && (
        <Link
          href={readMoreHref}
          className="inline-flex min-h-11 items-center type-meta font-medium text-accent-ink hover:underline sm:min-h-0"
        >
          Leer más<span className="sr-only"> de la reseña de {gameName}</span>
        </Link>
      )}
    </div>
  );
}

function CoverPlaceholder() {
  return (
    <span className="flex h-full w-full items-center justify-center text-border-strong">
      <Icon name="gamepad" className="h-5 w-5" />
    </span>
  );
}
