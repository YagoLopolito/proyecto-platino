import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { pageHref, pageWindow } from "@/lib/posts/pagination";

const itemClass =
  "flex h-11 min-w-11 items-center justify-center rounded-chip px-2 type-meta tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink sm:h-9 sm:min-w-9";

/**
 * Paginación numerada (`?page=N`): primera, anterior, números con "…",
 * siguiente y última. Son links y no estado: la página se puede recargar,
 * compartir y "atrás" vuelve a la anterior.
 */
export function Pagination({
  basePath,
  page,
  pageCount,
  label,
}: {
  basePath: string;
  page: number;
  pageCount: number;
  /** Nombre accesible de la nav ("Páginas de la galería"). */
  label: string;
}) {
  if (pageCount <= 1) return null;
  const href = (target: number) => pageHref(basePath, target);

  const edge = (
    target: number,
    icon: "arrow-left" | "arrow-right",
    text: string,
    disabled: boolean,
  ) =>
    disabled ? (
      <span className={`${itemClass} text-ink-faint opacity-50`} aria-hidden="true">
        <Icon name={icon} className="h-4 w-4" />
      </span>
    ) : (
      <Link
        href={href(target)}
        aria-label={text}
        className={`${itemClass} text-ink-muted hover:bg-surface-hover hover:text-ink`}
      >
        <Icon name={icon} className="h-4 w-4" />
      </Link>
    );

  return (
    <nav aria-label={label} className="flex justify-center">
      <ul className="flex flex-wrap items-center justify-center gap-1">
        {page > 1 && (
          <li className="hidden sm:block">
            <Link
              href={href(1)}
              className={`${itemClass} text-ink-muted hover:bg-surface-hover hover:text-ink`}
            >
              Primera
            </Link>
          </li>
        )}
        <li>{edge(page - 1, "arrow-left", "Página anterior", page <= 1)}</li>
        {pageWindow(page, pageCount).map((item) =>
          item.type === "ellipsis" ? (
            <li key={item.key} aria-hidden="true" className="px-1 type-meta text-ink-faint">
              …
            </li>
          ) : (
            <li key={item.page}>
              {item.page === page ? (
                <span
                  aria-current="page"
                  className={`${itemClass} border border-accent-ink bg-accent/15 font-semibold text-accent-ink`}
                >
                  <span className="sr-only">Página </span>
                  {item.page}
                </span>
              ) : (
                <Link
                  href={href(item.page)}
                  className={`${itemClass} text-ink-muted hover:bg-surface-hover hover:text-ink`}
                >
                  <span className="sr-only">Página </span>
                  {item.page}
                </Link>
              )}
            </li>
          ),
        )}
        <li>{edge(page + 1, "arrow-right", "Página siguiente", page >= pageCount)}</li>
        {page < pageCount && (
          <li className="hidden sm:block">
            <Link
              href={href(pageCount)}
              className={`${itemClass} text-ink-muted hover:bg-surface-hover hover:text-ink`}
            >
              Última
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
