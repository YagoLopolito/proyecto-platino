import type { ReactNode } from "react";
import { GamePoster } from "@/components/game/GamePoster";
import { PosterGrid } from "@/components/game/PosterGrid";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import type { DiaryTimelineEntry } from "@/lib/diary/queries";

/** Cuántas entradas de diario muestra la vista previa de un perfil. */
export const PROFILE_DIARY_PREVIEW_LIMIT = 6;

const SHORT_MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** `finished_on` es `date` ("YYYY-MM-DD"): se corta el string, no `new Date`. */
function shortDate(finishedOn: string): string {
  const [, month, day] = finishedOn.split("-");
  return `${Number(day)} ${SHORT_MONTHS[Number(month) - 1] ?? month}`;
}

/**
 * Últimas partidas terminadas de un perfil, con su puntuación y el arranque de
 * la reseña. El diario es público (ver CLAUDE.md), así que esto funciona igual
 * en el perfil propio y en el de otro usuario; cada carátula entra al diario de
 * ese juego, donde está la reseña completa.
 */
export function DiaryPreviewSection({
  entries,
  action,
  emptyMessage,
  title = "Últimas reseñas",
}: {
  entries: DiaryTimelineEntry[];
  action?: ReactNode;
  emptyMessage: string;
  title?: string;
}) {
  return (
    <section className="space-y-3" aria-labelledby="diary-preview-heading">
      <SectionHeader title={<span id="diary-preview-heading">{title}</span>} action={action} />
      {entries.length === 0 ? (
        <EmptyState icon="book" title={emptyMessage} />
      ) : (
        <PosterGrid>
          {entries.slice(0, PROFILE_DIARY_PREVIEW_LIMIT).map((entry) => (
            <li key={entry.id} data-testid="profile-diary-entry">
              <GamePoster
                href={`/juegos/${entry.gameId}/diario`}
                name={entry.gameName}
                imageUrl={entry.imageUrl}
                isPlatinum={entry.isPlatinum}
                isCompleted={entry.isCompleted}
                showName
                caption={
                  <span className="block space-y-0.5">
                    <span className="flex flex-wrap items-center justify-between gap-x-1.5">
                      <StarRatingDisplay rating={entry.rating} />
                      <span className="text-ink-faint">{shortDate(entry.finishedOn)}</span>
                    </span>
                    {entry.review && (
                      <span className="line-clamp-2 text-[11px] leading-snug text-ink-faint">
                        {entry.review}
                      </span>
                    )}
                  </span>
                }
              />
            </li>
          ))}
        </PosterGrid>
      )}
    </section>
  );
}
