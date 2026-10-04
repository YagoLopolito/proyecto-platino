"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { PostView } from "@/lib/posts/types";
import { PostCarousel } from "./PostCarousel";
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
 * Una publicación en el feed de la Galería online: cabecera (autor, juego,
 * fecha), carrusel, me gusta (también con doble tap), descripción, los últimos
 * comentarios y la caja para comentar. "Ver los N comentarios" abre el detalle.
 */
export function PostCard({ post }: { post: PostView }) {
  const like = usePostLike(post);
  const comments = useComments(post);
  const [editable, setEditable] = useEditablePost(post);
  const [deleted, setDeleted] = useState(false);
  const commentInput = useRef<HTMLInputElement>(null);

  if (deleted) return null;
  const label = `Publicación de ${post.author.name} en ${post.game.name}`;

  return (
    <article
      aria-label={label}
      data-testid="post-card"
      data-post-id={post.id}
      // Cada publicación es una tarjeta propia, también en mobile: con fotos a
      // ancho completo una debajo de otra, un hairline solo no alcanzaba para
      // ver dónde termina un post y empieza el siguiente.
      className="overflow-hidden rounded-card border border-border-strong bg-surface pb-3 shadow-lg shadow-black/30"
    >
      <PostHeader
        post={post}
        editedAt={editable.editedAt}
        menu={
          <PostMenu
            post={post}
            caption={editable.caption}
            isSpoiler={editable.isSpoiler}
            onEdited={(next) => setEditable(next)}
            onDeleted={() => setDeleted(true)}
          />
        }
      />
      <div>
        <PostCarousel
          media={post.media}
          variant="feed"
          isSpoiler={editable.isSpoiler}
          label={label}
          onDoubleTap={like.like}
        />
      </div>
      <div className="mt-1 space-y-2">
        <PostActions
          post={post}
          like={like}
          commentCount={comments.count}
          onComment={() => commentInput.current?.focus()}
        />
        <PostCaption post={post} caption={editable.caption} clamp />
        <div className="space-y-1.5 px-3 sm:px-4">
          {comments.count > comments.comments.length && (
            <Link
              href={`/publicaciones/${post.id}`}
              className="type-meta text-ink-muted hover:text-ink focus:outline-none focus-visible:underline"
            >
              Ver los {comments.count} comentarios
            </Link>
          )}
          <CommentList comments={comments.comments} onRemoved={comments.removed} />
          <CommentForm postId={post.id} onAdded={comments.added} inputRef={commentInput} />
        </div>
      </div>
    </article>
  );
}
