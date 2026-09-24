import { Icon } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { clearRecentSearches, deleteRecentSearch } from "@/lib/search/actions";
import { SCOPE_LABELS, saveAndGoHref, type RecentSearch } from "@/lib/search/scopes";

/**
 * "Búsquedas recientes" de `/buscar` sin query (issue #194), como la de
 * Letterboxd: versalitas, filas con el ámbito en un chip a la derecha, ✕ por
 * fila y "Borrar todo" al final. Tocar una la repite en su ámbito (y la sube
 * al principio: vuelve a pasar por `/buscar/ir`).
 *
 * Los ✕ son `<form>` con Server Action: funcionan sin JS.
 */
export function RecentSearches({ searches }: { searches: RecentSearch[] }) {
  if (searches.length === 0) return null;

  return (
    <section aria-labelledby="recientes" className="space-y-1">
      <SectionHeader title={<span id="recientes">Búsquedas recientes</span>} />
      <ul className="divide-y divide-border">
        {searches.map((search) => (
          <li key={search.id} className="flex items-center gap-2">
            <a
              href={saveAndGoHref(search.query, search.scope)}
              className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-card focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
            >
              <span className="truncate type-body text-ink">{search.query}</span>
              <span className="shrink-0 rounded-chip bg-surface-hover px-2 py-0.5 type-caption text-ink-muted">
                {SCOPE_LABELS[search.scope]}
              </span>
            </a>
            <form action={deleteRecentSearch}>
              <input type="hidden" name="id" value={search.id} />
              <button
                type="submit"
                aria-label={`Borrar “${search.query}” de recientes`}
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </form>
          </li>
        ))}
      </ul>
      <form action={clearRecentSearches} className="pt-2">
        <button
          type="submit"
          className="min-h-11 type-meta text-accent-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        >
          Borrar todo
        </button>
      </form>
    </section>
  );
}
