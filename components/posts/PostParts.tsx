"use client";

import Link from "next/link";
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";
import { Label, Textarea } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { GameArt } from "@/components/game/GameArt";
import { Icon } from "@/components/ui/Icon";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { relativeTime } from "@/lib/activity/format";
import { MAX_CAPTION_LENGTH, MAX_COMMENT_LENGTH } from "@/lib/posts/constants";
import type { PostComment, PostPerson, PostView } from "@/lib/posts/types";
import {
  addComment,
  deleteComment,
  deletePost,
  setPostLike,
  updatePost,
} from "@/lib/posts/actions";

export function profileHref(person: PostPerson, isSelf: boolean): string {
  return isSelf ? "/perfil" : `/perfil/${person.id}`;
}

function TimeAgo({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString("es-AR")}>
      {relativeTime(iso)}
    </time>
  );
}

// Cabecera ---------------------------------------------------------------------

export function PostHeader({
  post,
  editedAt,
  menu,
}: {
  post: PostView;
  editedAt: string | null;
  menu?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 sm:px-0">
      <Link
        href={profileHref(post.author, post.isOwn)}
        className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        aria-label={`Perfil de ${post.author.name}`}
        tabIndex={-1}
      >
        <FriendAvatar url={post.author.avatarUrl} name={post.author.name} size={36} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5 type-meta">
          <Link
            href={profileHref(post.author, post.isOwn)}
            className="font-semibold text-ink hover:underline focus:outline-none focus-visible:underline"
          >
            {post.author.name}
          </Link>
          <span className="text-ink-faint" aria-hidden="true">
            ·
          </span>
          <span className="text-ink-faint">
            <TimeAgo iso={post.publishedAt} />
          </span>
          {editedAt && <span className="type-caption text-ink-faint">(editado)</span>}
        </p>
        <Link
          href={`/juegos/${post.game.id}`}
          className="flex min-w-0 items-center gap-1.5 type-caption text-ink-muted hover:text-accent-ink focus:outline-none focus-visible:text-accent-ink"
        >
          {post.game.coverUrl ? (
            <GameArt
              src={post.game.coverUrl}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 shrink-0 rounded-sm object-cover"
              fallback={<Icon name="gamepad" className="h-4 w-4 shrink-0" />}
            />
          ) : (
            <Icon name="gamepad" className="h-4 w-4 shrink-0" />
          )}
          <span className="truncate">{post.game.name}</span>
        </Link>
      </div>
      {menu}
    </div>
  );
}

// Like -------------------------------------------------------------------------

/**
 * Estado del me gusta de una publicación, optimista (mismo contrato que
 * `LikeButton`): la action recibe el estado deseado y, si falla, `useOptimistic`
 * vuelve solo al último valor confirmado. Lo comparten el corazón y el doble tap.
 */
export function usePostLike(post: PostView) {
  const [confirmed, setConfirmed] = useState({ liked: post.likedByMe, count: post.likeCount });
  const [prev, setPrev] = useState({ liked: post.likedByMe, count: post.likeCount });
  if (prev.liked !== post.likedByMe || prev.count !== post.likeCount) {
    setPrev({ liked: post.likedByMe, count: post.likeCount });
    setConfirmed({ liked: post.likedByMe, count: post.likeCount });
  }
  const [optimistic, setOptimistic] = useOptimistic(confirmed);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function set(liked: boolean) {
    if (post.isOwn || liked === optimistic.liked) return;
    const next = { liked, count: Math.max(0, optimistic.count + (liked ? 1 : -1)) };
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      const result = await setPostLike(post.id, liked);
      if (result.error) setError(result.error);
      else setConfirmed(next);
    });
  }

  return { ...optimistic, error, toggle: () => set(!optimistic.liked), like: () => set(true) };
}

export function PostActions({
  post,
  like,
  commentCount,
  onComment,
}: {
  post: PostView;
  like: ReturnType<typeof usePostLike>;
  commentCount: number;
  onComment: () => void;
}) {
  return (
    <div className="space-y-1 px-3 sm:px-0">
      <div className="flex items-center gap-1">
        {post.isOwn ? (
          <span className="flex h-11 items-center gap-1.5 pr-2 text-ink-muted" title="Tus me gusta">
            <Icon name="heart" className="h-5 w-5 text-like" />
          </span>
        ) : (
          <button
            type="button"
            aria-pressed={like.liked}
            aria-label={`Me gusta la publicación de ${post.author.name}`}
            onClick={like.toggle}
            data-testid="post-like"
            className={`-ml-2 flex h-11 w-11 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink ${
              like.liked ? "text-like" : "text-ink hover:text-like"
            }`}
          >
            <Icon name={like.liked ? "heart" : "heart-outline"} className="h-6 w-6" />
          </button>
        )}
        <button
          type="button"
          onClick={onComment}
          aria-label="Comentar"
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:text-accent-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        >
          <Icon name="comment" className="h-5 w-5" />
        </button>
      </div>
      <p className="type-meta text-ink" data-testid="post-like-count">
        <span className="font-semibold tabular-nums">{like.count}</span> me gusta
        {commentCount > 0 && (
          <span className="text-ink-faint">
            {" "}
            · {commentCount} {commentCount === 1 ? "comentario" : "comentarios"}
          </span>
        )}
      </p>
      {like.error && (
        <p role="alert" className="type-caption text-danger">
          {like.error}
        </p>
      )}
    </div>
  );
}

// Descripción ------------------------------------------------------------------

export function PostCaption({
  post,
  caption,
  clamp,
}: {
  post: PostView;
  caption: string | null;
  clamp: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);

  // Si el texto se cortó depende del ancho, no del largo: se mide en el DOM.
  useEffect(() => {
    const element = textRef.current;
    if (!clamp || !element) return;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [clamp, caption]);

  if (!caption) return null;
  return (
    <div className="px-3 sm:px-0">
      <p
        ref={textRef}
        className={`whitespace-pre-line break-words type-body text-ink ${
          clamp && !expanded ? "line-clamp-2" : ""
        }`}
      >
        <Link
          href={profileHref(post.author, post.isOwn)}
          className="mr-1.5 font-semibold hover:underline"
        >
          {post.author.name}
        </Link>
        {caption}
      </p>
      {clamp && !expanded && overflows && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="type-meta text-ink-muted hover:text-ink focus:outline-none focus-visible:underline"
        >
          más
        </button>
      )}
    </div>
  );
}

// Comentarios ------------------------------------------------------------------

export function useComments(post: PostView) {
  const [comments, setComments] = useState<PostComment[]>(post.comments);
  const [count, setCount] = useState(post.commentCount);
  return {
    comments,
    count,
    added(comment: PostComment) {
      setComments((current) => [...current, comment]);
      setCount((n) => n + 1);
    },
    removed(id: string) {
      setComments((current) => current.filter((comment) => comment.id !== id));
      setCount((n) => Math.max(0, n - 1));
    },
  };
}

export function CommentList({
  comments,
  onRemoved,
}: {
  comments: PostComment[];
  onRemoved: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function remove(comment: PostComment) {
    setError(null);
    setPendingId(comment.id);
    const result = await deleteComment(comment.id);
    setPendingId(null);
    if (result.error) setError(result.error);
    else onRemoved(comment.id);
  }

  if (comments.length === 0) return null;
  return (
    <div className="space-y-1">
      <ul className="space-y-1.5" aria-label="Comentarios" data-testid="post-comments">
        {comments.map((comment) => (
          <li key={comment.id} className="group flex items-start gap-2">
            <p className="min-w-0 flex-1 whitespace-pre-line break-words type-body text-ink">
              <Link
                href={`/perfil/${comment.author.id}`}
                className="mr-1.5 font-semibold hover:underline"
              >
                {comment.author.name}
              </Link>
              {comment.body}
              <span className="ml-2 type-caption text-ink-faint">
                <TimeAgo iso={comment.createdAt} />
              </span>
            </p>
            {comment.canDelete && (
              <button
                type="button"
                onClick={() => void remove(comment)}
                disabled={pendingId === comment.id}
                aria-label={`Borrar el comentario de ${comment.author.name}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-chip text-ink-faint transition-colors hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink disabled:opacity-40"
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <FormError>{error}</FormError>
    </div>
  );
}

export function CommentForm({
  postId,
  onAdded,
  inputRef,
}: {
  postId: string;
  onAdded: (comment: PostComment) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const result = await addComment(postId, text);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setBody("");
      onAdded(result.comment);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">
          Agregar un comentario
        </label>
        <input
          ref={inputRef}
          id={id}
          value={body}
          maxLength={MAX_COMMENT_LENGTH}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Agregá un comentario…"
          autoComplete="off"
          className="min-h-11 min-w-0 flex-1 bg-transparent type-body text-ink placeholder:text-ink-faint focus:outline-none sm:min-h-9"
        />
        <button
          type="submit"
          disabled={pending || body.trim() === ""}
          className="min-h-11 rounded-chip px-2 type-meta font-semibold text-accent-ink transition-opacity hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink disabled:opacity-40 sm:min-h-9"
        >
          Publicar
        </button>
      </div>
      {body.length > MAX_COMMENT_LENGTH * 0.9 && (
        <p className="text-right type-caption text-ink-faint">
          {body.length}/{MAX_COMMENT_LENGTH}
        </p>
      )}
      <FormError>{error}</FormError>
    </form>
  );
}

// Menú del autor -----------------------------------------------------------------

/**
 * "…" del autor: editar (descripción y spoiler) y borrar (con confirmación).
 * El menú es estado propio y no un `<details>`: cierra al tocar afuera y con
 * Escape, como `DiaryActionsMenu`.
 */
export function PostMenu({
  post,
  caption,
  isSpoiler,
  onEdited,
  onDeleted,
}: {
  post: PostView;
  caption: string | null;
  isSpoiler: boolean;
  onEdited: (next: { caption: string | null; isSpoiler: boolean; editedAt: string | null }) => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draftCaption, setDraftCaption] = useState(caption ?? "");
  const [draftSpoiler, setDraftSpoiler] = useState(isSpoiler);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const captionId = useId();
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function startEdit() {
    setOpen(false);
    setDraftCaption(caption ?? "");
    setDraftSpoiler(isSpoiler);
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updatePost({
        postId: post.id,
        caption: draftCaption,
        isSpoiler: draftSpoiler,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      const trimmed = draftCaption.trim();
      onEdited({
        caption: trimmed === "" ? null : trimmed,
        isSpoiler: draftSpoiler,
        editedAt: result.editedAt ?? null,
      });
      setEditing(false);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deletePost(post.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirmDelete(false);
      onDeleted();
    });
  }

  if (!post.isOwn) return null;

  const itemClass =
    "flex w-full min-h-11 items-center gap-2 px-3 text-left type-meta transition-colors hover:bg-surface-hover focus:outline-none focus-visible:bg-surface-hover sm:min-h-9";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Opciones de la publicación"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-chip text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
      >
        <Icon name="more" className="h-5 w-5 rotate-90" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-card border border-border bg-surface-raised py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={startEdit}
            className={`${itemClass} text-ink`}
          >
            <Icon name="edit" className="h-4 w-4" />
            Editar
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setError(null);
              setConfirmDelete(true);
            }}
            className={`${itemClass} text-danger`}
          >
            <Icon name="close" className="h-4 w-4" />
            Borrar
          </button>
        </div>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="Editar publicación">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={captionId}>Descripción</Label>
            <Textarea
              id={captionId}
              rows={5}
              value={draftCaption}
              maxLength={MAX_CAPTION_LENGTH}
              onChange={(event) => setDraftCaption(event.target.value)}
            />
            <p className="text-right type-caption text-ink-faint">
              {draftCaption.length}/{MAX_CAPTION_LENGTH}
            </p>
          </div>
          <ToggleChip checked={draftSpoiler} onChange={setDraftSpoiler}>
            Contiene spoilers
          </ToggleChip>
          <FormError>{error}</FormError>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="¿Borrar la publicación?"
        description="Se borran las fotos y videos, los me gusta y los comentarios. No se puede deshacer."
      >
        <div className="space-y-3">
          <FormError>{error}</FormError>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" onClick={remove} disabled={pending}>
              {pending ? "Borrando…" : "Borrar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Estado local de lo editable de un post (descripción, spoiler, "editado"). */
export function useEditablePost(post: PostView) {
  const [state, setState] = useState({
    caption: post.caption,
    isSpoiler: post.isSpoiler,
    editedAt: post.editedAt,
  });
  return [state, setState] as const;
}

export function useRefreshAfterDelete(fallbackHref?: string) {
  const router = useRouter();
  return () => {
    if (fallbackHref) router.replace(fallbackHref);
    router.refresh();
  };
}
