import Link from "next/link";
import type { ListItem } from "@/lib/lists/queries";
import { GamePoster } from "@/components/game/GamePoster";
import { PosterGrid } from "@/components/game/PosterGrid";
import { GameArt } from "@/components/game/GameArt";
import { ProgressBar } from "@/components/ProgressBar";
import { Icon } from "@/components/ui/Icon";

export type ListView = "grilla" | "detalle";

export function parseListView(raw: string | undefined): ListView {
  return raw === "detalle" ? "detalle" : "grilla";
}

/**
 * "Vos jugaste N de M" (#189): el gancho de una lista ajena. Compartido por la
 * ficha de una lista de usuario y la de una pregenerada (#192).
 */
export function ListProgress({ played, total }: { played: number; total: number }) {
  return (
    <section aria-label="Tu progreso en la lista" className="max-w-md space-y-1.5">
      <p className="type-meta text-ink-muted">
        Vos jugaste <span className="font-semibold text-ink">{played}</span> de {total}
      </p>
      <ProgressBar percent={total > 0 ? (played / total) * 100 : 0} className="h-1" />
    </section>
  );
}

/**
 * Los juegos de una lista, en grilla de pósters o en detalle (con la nota de
 * cada uno). La vista vive en `?vista=` (links, no estado), así que `href` es
 * la ruta de la ficha sin query.
 */
export function ListGames({
  items,
  isRanked,
  view,
  href,
}: {
  items: ListItem[];
  isRanked: boolean;
  view: ListView;
  href: string;
}) {
  const viewLink = (value: ListView, label: string) => (
    <Link
      href={value === "grilla" ? href : `${href}?vista=detalle`}
      aria-current={view === value ? "page" : undefined}
      className={`flex min-h-10 items-center rounded-chip px-3 type-caption font-medium transition-colors sm:min-h-9 ${
        view === value
          ? "bg-accent/15 text-accent-ink shadow-[inset_0_0_0_1px_var(--color-accent-ink)]"
          : "text-ink-muted hover:bg-surface-hover hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <nav
        aria-label="Vista de la lista"
        className="inline-flex items-center rounded-card border border-border-strong bg-surface p-0.5"
      >
        {viewLink("grilla", "Grilla")}
        {viewLink("detalle", "Detalle")}
      </nav>

      {view === "grilla" ? (
        <PosterGrid>
          {items.map((item, index) => (
            <li key={item.gameId}>
              <GamePoster
                href={`/juegos/${item.gameId}`}
                name={item.name}
                imageUrl={item.imageUrl}
                overlay={
                  isRanked ? (
                    <span className="absolute left-1 top-1 rounded-chip bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-ink backdrop-blur-sm">
                      {index + 1}
                    </span>
                  ) : undefined
                }
              />
            </li>
          ))}
        </PosterGrid>
      ) : (
        <ol aria-label="Juegos de la lista" className="divide-y divide-border">
          {items.map((item, index) => (
            <li key={item.gameId}>
              <Link
                href={`/juegos/${item.gameId}`}
                className="flex gap-3 py-3 transition-colors hover:bg-surface-hover/50"
              >
                {isRanked && (
                  <span className="w-7 shrink-0 pt-0.5 text-right type-stat text-ink-faint">
                    {index + 1}
                  </span>
                )}
                <span className="relative block aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-chip border border-border bg-surface">
                  {item.imageUrl ? (
                    <GameArt
                      src={item.imageUrl}
                      alt=""
                      sizes="56px"
                      className="object-cover"
                      fallback={null}
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-ink-faint">
                      <Icon name="gamepad" className="h-5 w-5" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 space-y-1">
                  <span className="block type-subtitle text-ink">
                    {item.name}
                    {item.releaseYear && (
                      <span className="ml-2 type-meta text-ink-faint">{item.releaseYear}</span>
                    )}
                  </span>
                  {item.note && (
                    <span className="block type-review text-ink-muted">{item.note}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
