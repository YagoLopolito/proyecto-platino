"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { Button } from "@/components/Button";
import { loadMoreActivity } from "@/lib/activity/actions";
import { formatDiaryDate, relativeTime, type ActivityTab } from "@/lib/activity/format";
import type { ActivityEvent } from "@/lib/activity/queries";
import { reviewFocusHref } from "@/lib/game-page/review-focus";

/**
 * El log de Actividad (epic #183, issue #195), como la Activity de
 * Letterboxd: frases, no tarjetas. Sin carátulas: es un log, se escanea.
 *
 * Misma mecánica que el feed de reseñas: la primera página viene del server y
 * "Cargar más" **suma** la siguiente abajo (Server Action + cursor), con el
 * foco en el primer evento nuevo.
 */
export function ActivityFeed({
  tab,
  tipo,
  initialEvents,
  initialCursor,
  label,
}: {
  tab: ActivityTab;
  tipo: string | null;
  initialEvents: ActivityEvent[];
  initialCursor: string | null;
  label: string;
}) {
  const [pages, setPages] = useState({ events: initialEvents, cursor: initialCursor });
  // Otra primera página del server (cambió el filtro, revalidación): manda el
  // server, ajustado durante el render y no en un effect.
  const [prevInitial, setPrevInitial] = useState(initialEvents);
  if (prevInitial !== initialEvents) {
    setPrevInitial(initialEvents);
    setPages({ events: initialEvents, cursor: initialCursor });
  }

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [focusId, setFocusId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!focusId) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(focusId)}"]`)
      ?.focus();
  }, [focusId]);

  function loadMore() {
    const cursor = pages.cursor;
    if (!cursor) return;
    setError(null);
    startTransition(async () => {
      const next = await loadMoreActivity(tab, cursor, tipo);
      if (next.status === "error") {
        setError(`No se pudo cargar más actividad: ${next.message}`);
        return;
      }
      const seen = new Set(pages.events.map((event) => event.id));
      const fresh = next.events.filter((event) => !seen.has(event.id));
      setPages({ events: [...pages.events, ...fresh], cursor: next.nextCursor });
      setFocusId(fresh[0]?.id ?? null);
    });
  }

  return (
    <div className="space-y-4">
      <ul ref={listRef} className="divide-y divide-border" aria-label={label}>
        {pages.events.map((event) => (
          <ActivityRow key={event.id} event={event} tab={tab} />
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

function Strong({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-ink hover:text-accent-ink">
      {children}
    </Link>
  );
}

function ActivityRow({ event, tab }: { event: ActivityEvent; tab: ActivityTab }) {
  const actorHref = `/perfil/${event.actor.id}`;
  const isPlatinum = event.kind === "platinum";

  return (
    <li
      data-event-id={event.id}
      data-kind={event.kind}
      tabIndex={-1}
      className="flex items-start gap-3 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
    >
      {isPlatinum ? (
        // El trofeo reemplaza al avatar: en Vos el actor sos siempre vos, y lo
        // que distingue la fila es qué conseguiste.
        <Image
          src="/trophy-platinum.webp"
          alt=""
          width={32}
          height={32}
          unoptimized
          className="h-8 w-8 shrink-0 object-contain"
        />
      ) : (
        <Link href={actorHref} aria-hidden="true" tabIndex={-1} className="shrink-0">
          <FriendAvatar url={event.actor.avatarUrl} name={event.actor.name} size={32} />
        </Link>
      )}
      <p className="min-w-0 flex-1 type-body text-ink-muted">
        <Sentence event={event} tab={tab} />
      </p>
      <time
        dateTime={event.occurredAt}
        title={new Date(event.occurredAt).toLocaleString("es-AR")}
        className="shrink-0 type-caption tabular-nums text-ink-faint"
        suppressHydrationWarning
      >
        {relativeTime(event.occurredAt)}
      </time>
    </li>
  );
}

function Sentence({ event, tab }: { event: ActivityEvent; tab: ActivityTab }) {
  const actor = <Strong href={`/perfil/${event.actor.id}`}>{event.actor.name}</Strong>;
  const game = event.game && <Strong href={`/juegos/${event.game.id}`}>{event.game.name}</Strong>;
  const list = event.list && <Strong href={`/listas/${event.list.id}`}>{event.list.title}</Strong>;

  switch (event.kind) {
    case "diary": {
      const date = event.finishedOn
        ? formatDiaryDate(event.finishedOn, new Date().getFullYear())
        : null;
      const gameLink = event.game && (
        <Strong
          href={
            event.entryId
              ? reviewFocusHref(event.game.id, event.entryId)
              : `/juegos/${event.game.id}`
          }
        >
          {event.game.name}
        </Strong>
      );
      return (
        <>
          {tab === "vos" ? "Registraste" : <>{actor} registró</>} {gameLink}
          {event.rating !== null && (
            <>
              {" "}
              <StarRatingDisplay rating={event.rating} tone="others" />
            </>
          )}
          {date && <> {date}</>}
        </>
      );
    }
    case "platinum":
      return <>Platinaste {game}</>;
    case "completion":
      return <>Completaste {game} al 100%</>;
    case "playing":
      return <>Empezaste a jugar {game}</>;
    case "playlist":
      return <>Agregaste {game} a tu Playlist</>;
    case "list_created":
      return <>Creaste la lista {list}</>;
    case "list_updated":
      return <>Actualizaste la lista {list}</>;
    case "like_review":
      return (
        <>
          Te gustó la reseña de {actor} de {game}
        </>
      );
    case "like_list":
      return (
        <>
          Te gustó la lista {list} de {actor}
        </>
      );
    case "liked_review":
      return (
        <>
          A {actor} le gustó tu reseña de {game}
        </>
      );
    case "liked_list":
      return (
        <>
          A {actor} le gustó tu lista {list}
        </>
      );
    case "follow":
      return <>{actor} empezó a seguirte</>;
  }
}
