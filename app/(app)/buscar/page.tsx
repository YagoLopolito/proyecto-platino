import { SectionPlaceholder } from "@/components/SectionPlaceholder";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "Buscar" };

/**
 * Buscar (epic #183). La búsqueda en sí -- juegos, estudios, listas y
 * usuarios, con recientes -- llega con el sub-issue #194. El campo ya existe y
 * mantiene `?q=` en la URL, que es el contrato que usa el buscador del header
 * de escritorio: así el día que llegue la feature no cambia ningún link.
 */
export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  return (
    <SectionPlaceholder
      icon="search"
      title={
        q
          ? `Todavía no se puede buscar “${q}”: la búsqueda llega pronto.`
          : "Buscá juegos, estudios, listas y usuarios."
      }
      description="Mientras tanto, tu biblioteca tiene su propio buscador."
    >
      {/* `<form method="get">` común: funciona sin JS y deja `?q=` en la URL. */}
      <form action="/buscar" method="get" role="search" className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
        />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Juegos, estudios, listas, usuarios"
          aria-label="Buscar"
          className="min-h-11 w-full rounded-card border border-border-strong bg-surface pl-9 pr-3 type-meta text-ink transition-colors placeholder:text-ink-faint hover:border-ink-faint focus:border-accent-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/40 [&::-webkit-search-cancel-button]:hidden"
        />
      </form>
    </SectionPlaceholder>
  );
}
