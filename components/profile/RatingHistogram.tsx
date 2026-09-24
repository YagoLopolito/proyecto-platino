import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { RATING_STEPS, starsLabel, type RatingHistogram as Histogram } from "@/lib/profile/stats";

function gamesLabel(count: number): string {
  return count === 1 ? "1 juego" : `${count} juegos`;
}

function starsPhrase(step: number): string {
  if (step === 1) return "media estrella";
  if (step === 2) return "1 estrella";
  return `${starsLabel(step)} estrellas`;
}

/**
 * "Tus puntuaciones" (issue #196): 10 barras, de ½ a 5 estrellas, con el total
 * a la izquierda y el promedio a la derecha, como el histograma del perfil de
 * Letterboxd. Cuenta el **último** rating de cada juego (mismo criterio que
 * `game_scores`), no cada rejugada.
 *
 * Cada barra es un link a las reseñas con esa puntuación. Las barras son la
 * forma, no la información: el número exacto va en el `aria-label` de cada link
 * y, para un lector de pantalla, en la tabla equivalente (`sr-only`).
 */
export function RatingHistogram({ histogram }: { histogram: Histogram }) {
  const max = Math.max(1, ...histogram.counts);

  return (
    <section className="space-y-3" aria-labelledby="ratings-heading">
      <SectionHeader title={<span id="ratings-heading">Tus puntuaciones</span>} />
      {histogram.total === 0 ? (
        <p className="type-meta text-ink-muted">
          Todavía no puntuaste ningún juego. Tus puntuaciones van a aparecer acá.
        </p>
      ) : (
        <>
          <div className="flex items-end gap-3">
            <p className="w-12 shrink-0 text-center">
              <span className="block type-stat text-ink">{histogram.total}</span>
              <span className="block type-overline text-ink-faint">juegos</span>
            </p>
            <ul className="flex h-20 flex-1 items-end gap-0.5" data-testid="rating-histogram">
              {histogram.counts.map((count, index) => {
                const step = index + 1;
                const height = count === 0 ? 0 : Math.max(6, Math.round((count / max) * 100));
                return (
                  <li key={step} className="flex h-full flex-1">
                    <Link
                      href={`/perfil/resenas?rating=${step}`}
                      aria-label={`${gamesLabel(count)} con ${starsPhrase(step)}`}
                      data-count={count}
                      className="group flex h-full w-full items-end rounded-chip focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
                    >
                      <span
                        className="block w-full rounded-t-chip border-b border-border-strong bg-ink-faint transition-colors group-hover:bg-rating"
                        style={{ height: `${height}%` }}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="w-12 shrink-0 text-center">
              <span className="block type-stat text-ink">{histogram.averageStars?.toFixed(1)}</span>
              <span className="flex items-center justify-center gap-0.5 type-overline text-ink-faint">
                <Icon name="star" className="h-3 w-3" />
                prom.
              </span>
            </p>
          </div>
          <div
            className="ml-15 mr-15 flex justify-between type-caption text-ink-faint"
            aria-hidden="true"
          >
            <span>½</span>
            <span>5</span>
          </div>
          <table className="sr-only">
            <caption>Juegos por puntuación (último rating de cada juego)</caption>
            <thead>
              <tr>
                <th scope="col">Estrellas</th>
                <th scope="col">Juegos</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: RATING_STEPS }, (_, index) => (
                <tr key={index}>
                  <th scope="row">{starsLabel(index + 1)}</th>
                  <td>{histogram.counts[index]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
