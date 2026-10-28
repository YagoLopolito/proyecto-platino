"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button, buttonClassName } from "@/components/Button";
import { Textarea } from "@/components/Input";
import { publishFiles } from "@/lib/posts/publish-files";
import { MAX_CAPTION_LENGTH } from "@/lib/posts/constants";
import type { PlatinumPiece } from "@/lib/platinum/stats";

type CardState =
  { status: "loading" } | { status: "ready"; file: File; previewUrl: string } | { status: "error" };

type PublishState =
  | { status: "idle" }
  | { status: "publishing" }
  | { status: "done"; postId: string }
  | { status: "error"; message: string };

/**
 * "Compartir en actividad": la card "¡Platiné X!" que dibuja el servidor
 * (`/api/platino/[gameId]/tarjeta`), con vista previa y un texto opcional, y
 * se publica en la Galería online por el mismo camino que cualquier foto
 * (`publishFiles`), con `kind: "platinum"` para que el feed la destaque.
 *
 * La card se baja una sola vez: la vista previa y lo que se sube son el mismo
 * archivo.
 */
export default function SharePlatinumDialog({
  piece,
  onClose,
}: {
  piece: PlatinumPiece;
  onClose: () => void;
}) {
  const [card, setCard] = useState<CardState>({ status: "loading" });
  const [caption, setCaption] = useState("");
  const [publish, setPublish] = useState<PublishState>({ status: "idle" });

  // Pedido al servidor + object URL (recurso del navegador que hay que
  // liberar): efecto externo. El setState llega en el callback async.
  useEffect(() => {
    let cancelled = false;
    let previewUrl: string | null = null;
    void fetch(`/api/platino/${piece.gameId}/tarjeta`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (cancelled) return;
        const file = new File([blob], `platino-${piece.gameId}.png`, { type: "image/png" });
        previewUrl = URL.createObjectURL(file);
        setCard({ status: "ready", file, previewUrl });
      })
      .catch(() => {
        if (!cancelled) setCard({ status: "error" });
      });
    return () => {
      cancelled = true;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [piece.gameId]);

  async function onPublish() {
    if (card.status !== "ready") return;
    setPublish({ status: "publishing" });
    const result = await publishFiles({
      gameId: piece.gameId,
      files: [card.file],
      caption,
      kind: "platinum",
    });
    setPublish(
      result.status === "ok"
        ? { status: "done", postId: result.postId }
        : { status: "error", message: result.message },
    );
  }

  return (
    <Modal open onClose={onClose} title="Compartir en actividad" description={piece.name}>
      {publish.status === "done" ? (
        <div className="space-y-4">
          <p role="status" className="type-body text-success">
            Listo: tu platino ya está en la Galería online.
          </p>
          <div className="flex flex-wrap gap-2">
            {/* Navegación completa y no `<Link>`: desde un modal, una suave se
                interceptaría y abriría el detalle en otro modal encima. */}
            <a href={`/publicaciones/${publish.postId}`} className={buttonClassName("primary")}>
              Ver publicación
            </a>
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="mx-auto aspect-[4/5] w-full max-w-[16rem] overflow-hidden rounded-card border border-border-strong bg-surface">
            {card.status === "ready" ? (
              <Image
                src={card.previewUrl}
                alt={`Card de platino de ${piece.name}`}
                width={1080}
                height={1350}
                unoptimized
                className="h-full w-full object-cover"
              />
            ) : (
              <p
                role={card.status === "error" ? "alert" : "status"}
                className="flex h-full items-center justify-center p-4 text-center type-meta text-ink-muted"
              >
                {card.status === "loading"
                  ? "Armando tu card…"
                  : "No se pudo generar la card. Probá de nuevo más tarde."}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="platinum-caption" className="type-meta font-medium text-ink">
              Texto (opcional)
            </label>
            <Textarea
              id="platinum-caption"
              rows={3}
              maxLength={MAX_CAPTION_LENGTH}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="¿Cómo fue el camino hasta el platino?"
            />
          </div>

          {publish.status === "error" && (
            <p role="alert" className="type-meta text-danger">
              {publish.message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void onPublish()}
              disabled={card.status !== "ready" || publish.status === "publishing"}
            >
              {publish.status === "publishing" ? "Publicando…" : "Publicar en la Galería"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
