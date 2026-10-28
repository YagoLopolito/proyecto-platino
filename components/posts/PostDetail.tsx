"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PostView } from "@/lib/posts/types";
import { PostCarousel } from "./PostCarousel";
import { PlatinumPostBadge } from "@/components/platinum/PlatinumPostBadge";
import {
  CommentForm,
  CommentList,
  PostActions,
  PostCaption,
  PostHeader,
  PostMenu,
  useComments,
  useEditablePost,
  usePostLike,
} from "./PostParts";

/**
 * Detalle de una publicación, como Instagram de escritorio: el archivo a la
 * izquierda (original, `object-contain` sobre negro) y a la derecha autor,
 * juego, descripción, todos los comentarios y la caja para comentar. En mobile
 * va todo apilado.
 *
 * Sirve para el modal (ruta interceptada) y para la página (`inModal` decide
 * qué pasa al borrar: cerrar el modal o ir a la galería).
 */
export function PostDetail({ post, inModal }: { post: PostView; inModal: boolean }) {
  const router = useRouter();
  const like = usePostLike(post);
  const comments = useComments(post);
  const [editable, setEditable] = useEditablePost(post);
  const commentInput = useRef<HTMLInputElement>(null);
  const [deleted, setDeleted] = useState(false);
  const label = `Publicación de ${post.author.name} en ${post.game.name}`;

  function onDeleted() {
    setDeleted(true);
    if (inModal) router.back();
    else router.replace("/actividad/galeria");
    router.refresh();
  }

  if (deleted) {
    return (
      <p role="status" className="p-8 text-center type-body text-ink-muted">
        Publicación borrada.
      </p>
    );
  }

  return (
    <article
      aria-label={label}
      data-testid="post-detail"
      data-post-id={post.id}
      className="flex min-h-full flex-col md:h-full md:flex-row"
    >
      <div className="bg-black md:min-h-0 md:min-w-0 md:flex-1">
        <PostCarousel
          media={post.media}
          variant="detail"
          isSpoiler={editable.isSpoiler}
          label={label}
          onDoubleTap={like.like}
          globalKeys
        />
      </div>

      <div className="flex min-h-0 flex-col border-border md:w-[22rem] md:shrink-0 md:border-l lg:w-[24rem]">
        <div className="border-b border-border">
          <PostHeader
            post={post}
            editedAt={editable.editedAt}
            menu={
              <PostMenu
                post={post}
                caption={editable.caption}
                isSpoiler={editable.isSpoiler}
                onEdited={(next) => setEditable(next)}
                onDeleted={onDeleted}
              />
            }
          />
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto py-3">
          {post.kind === "platinum" && (
            <div className="px-3 sm:px-4">
              <PlatinumPostBadge />
            </div>
          )}
          <PostCaption post={post} caption={editable.caption} clamp={false} />
          <div className="px-3 sm:px-4">
            {comments.comments.length === 0 ? (
              <p className="type-meta text-ink-faint">Todavía no hay comentarios.</p>
            ) : (
              <CommentList comments={comments.comments} onRemoved={comments.removed} />
            )}
          </div>
        </div>

        <div className="space-y-2 border-t border-border py-2 pb-safe">
          <PostActions
            post={post}
            like={like}
            commentCount={comments.count}
            onComment={() => commentInput.current?.focus()}
          />
          <div className="px-3 sm:px-4">
            <CommentForm postId={post.id} onAdded={comments.added} inputRef={commentInput} />
          </div>
        </div>
      </div>
    </article>
  );
}
