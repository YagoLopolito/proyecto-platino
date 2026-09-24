import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/EmptyState";
import { GamePoster } from "@/components/game/GamePoster";
import { StarRatingDisplay } from "@/components/diary/StarRating";
import { ProfileSubpage } from "@/components/profile/ProfileSubpage";
import { getOwnProfileSummary } from "@/lib/profile/summary";
import { entriesForRatingStep, RATING_STEPS, starsLabel } from "@/lib/profile/stats";
import { reviewFocusHref } from "@/lib/game-page/review-focus";

export const metadata = { title: "Tus reseñas" };

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

/** `finished_on` es `date`: se corta el string, nunca `new Date` (correría el día). */
function formatDate(finishedOn: string): string {
  const [year, month, day] = finishedOn.split("-");
  return `${Number(day)} ${SHORT_MONTHS[Number(month) - 1] ?? month} ${year}`;
}

function parseRatingStep(value: string | string[] | undefined): number | null {
  const step = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(step) && step >= 1 && step <= RATING_STEPS ? step : null;
}

/**
 * Todas tus reseñas (issue #196), filas con hairline y el texto en la serif de
 * lectura. Sin filtro muestra las que tienen texto; con `?rating=N` (las barras
 * del histograma) muestra los juegos con esa puntuación como último rating,
 * tengan texto o no, que es lo que cuenta la barra.
 */
export default async function ResenasPage({
  searchParams,
}: {
  searchParams: Promise<{ rating?: string | string[] }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ entries }, params] = await Promise.all([
    getOwnProfileSummary(supabase, user.id),
    searchParams,
  ]);
  const step = parseRatingStep(params.rating);
  const shown =
    step === null
      ? entries.filter((entry) => entry.review?.trim())
      : entriesForRatingStep(entries, step);

  const subtitle =
    step === null
      ? shown.length === 1
        ? "1 reseña con texto"
        : `${shown.length} reseñas con texto`
      : `${shown.length === 1 ? "1 juego" : `${shown.length} juegos`} con ${starsLabel(step)} ${step <= 2 ? "estrella" : "estrellas"}`;

  return (
    <ProfileSubpage title="Tus reseñas" subtitle={subtitle}>
      {step !== null && (
        <Link
          href="/perfil/resenas"
          className="type-meta font-medium text-accent-ink hover:underline"
        >
          Ver todas las reseñas
        </Link>
      )}
      {shown.length === 0 ? (
        <EmptyState
          icon="note"
          title={
            step === null
              ? "Todavía no escribiste ninguna reseña."
              : "Ningún juego tiene esa puntuación."
          }
        />
      ) : (
        <ul
          aria-label="Reseñas"
          className="max-w-2xl divide-y divide-border border-y border-border"
        >
          {shown.map((entry) => (
            <li key={entry.id} className="flex gap-3 py-4" data-testid="own-review">
              <div className="w-16 shrink-0">
                <GamePoster
                  href={reviewFocusHref(entry.gameId, entry.id)}
                  name={entry.gameName}
                  imageUrl={entry.imageUrl}
                  isPlatinum={entry.isPlatinum}
                  isCompleted={entry.isCompleted}
                  sizes="64px"
                />
              </div>
              <div className="min-w-0 space-y-1">
                <Link
                  href={reviewFocusHref(entry.gameId, entry.id)}
                  className="type-headline text-ink hover:underline"
                >
                  {entry.gameName}
                </Link>
                <p className="flex flex-wrap items-center gap-2 type-meta text-ink-faint">
                  <StarRatingDisplay rating={entry.rating} tone="own" />
                  {formatDate(entry.finishedOn)}
                </p>
                {entry.review && (
                  <p className="whitespace-pre-line type-review text-ink-muted">{entry.review}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </ProfileSubpage>
  );
}
