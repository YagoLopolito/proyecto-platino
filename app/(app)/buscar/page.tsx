import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoadingState } from "@/components/LoadingState";
import { SectionAction, SectionHeader } from "@/components/ui/SectionHeader";
import { ErrorState } from "@/components/ErrorState";
import { RecentSearches } from "@/components/search/RecentSearches";
import { SearchBox } from "@/components/search/SearchBox";
import {
  GameResults,
  ListResults,
  StudioResults,
  UserResults,
} from "@/components/search/SearchResults";
import { SwipeTabs } from "@/components/ui/SwipeTabs";
import { MIN_QUERY_LENGTH } from "@/lib/catalog/constants";
import { searchUsers } from "@/lib/friends/actions";
import { getRecentSearches, searchGames, searchLists, searchStudios } from "@/lib/search/queries";
import {
  MAX_QUERY_LENGTH,
  SCOPE_LABELS,
  SEARCH_TABS,
  parseSearchScope,
  searchHref,
  type SearchScope,
} from "@/lib/search/scopes";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Buscar" };

/**
 * Buscar (epic #183, issue #194). Sin query: el campo enfocado y las
 * búsquedas recientes. Con query: tabs Todo · Juegos · Estudios · Listas ·
 * Usuarios, con la búsqueda y la tab en la URL (`/buscar?q=insomniac&en=estudios`),
 * así sobrevive al refresh y "atrás" funciona. Sólo se consulta la tab abierta.
 *
 * "Todo" es la default: un poco de cada ámbito, y "Ver todo" lleva a su tab.
 *
 * Los resultados van en su propio `Suspense` (con `key` por búsqueda), y no
 * hay `loading.tsx`: el campo tiene que quedar montado mientras se busca. Con
 * el `loading.tsx` de la ruta, cada búsqueda nueva podía reemplazar la
 * pantalla entera -- campo incluido -- por el spinner.
 */
export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; en?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const scope = parseSearchScope(params.en);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const searching = query.length >= MIN_QUERY_LENGTH;

  return (
    <div className="flex flex-1 flex-col bg-background text-ink">
      <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:pt-8">
        <h1 className="sr-only">Buscar</h1>
        <SearchBox query={query} scope={scope} />
      </div>
      {searching ? (
        <SwipeTabs
          label="Resultados"
          tabs={SEARCH_TABS.map((option) => ({
            href: searchHref(query, option),
            label: SCOPE_LABELS[option],
          }))}
          activeHref={searchHref(query, scope)}
        >
          <div className="mx-auto w-full max-w-5xl px-4 py-4">
            <Suspense key={`${scope}:${query}`} fallback={<LoadingState />}>
              <TabResults query={query} scope={scope} userId={user.id} />
            </Suspense>
          </div>
        </SwipeTabs>
      ) : (
        <div className="mx-auto w-full max-w-5xl px-4 py-6">
          {query !== "" && (
            <p role="status" className="mb-4 type-caption text-ink-muted">
              Escribí al menos {MIN_QUERY_LENGTH} letras para buscar.
            </p>
          )}
          <RecentSearches searches={await getRecentSearches(supabase, user.id)} />
        </div>
      )}
    </div>
  );
}

/** Cuántos resultados de cada ámbito muestra la tab "Todo". */
const ALL_TAB_LIMIT = 5;

async function TabResults({
  query,
  scope,
  userId,
}: {
  query: string;
  scope: SearchScope;
  userId: string;
}) {
  const supabase = await createClient();
  const tab = scope;

  if (tab === "todo") {
    // Todo en paralelo. Estudios sin IGDB (la consulta más lenta): acá van
    // los que ya conocemos, y la tab Estudios busca en IGDB.
    const [games, studios, lists, users] = await Promise.all([
      searchGames(supabase, userId, query),
      searchStudios(supabase, query, { withIgdb: false }),
      searchLists(supabase, userId, query),
      searchUsers(query),
    ]);
    const sections = [
      games.status !== "error" && games.hits.length > 0 && (
        <AllSection key="juegos" scope="juegos" query={query}>
          <GameResults hits={games.hits.slice(0, ALL_TAB_LIMIT)} query={query} scope={scope} />
        </AllSection>
      ),
      studios.hits.length > 0 && (
        <AllSection key="estudios" scope="estudios" query={query}>
          <StudioResults
            hits={studios.hits.slice(0, ALL_TAB_LIMIT)}
            igdbUnavailable={false}
            query={query}
            scope={scope}
          />
        </AllSection>
      ),
      lists.length > 0 && (
        <AllSection key="listas" scope="listas" query={query}>
          <ListResults lists={lists.slice(0, ALL_TAB_LIMIT)} query={query} scope={scope} />
        </AllSection>
      ),
      users.status !== "error" && users.results.length > 0 && (
        <AllSection key="usuarios" scope="usuarios" query={query}>
          <UserResults users={users.results.slice(0, ALL_TAB_LIMIT)} query={query} scope={scope} />
        </AllSection>
      ),
    ].filter(Boolean);
    if (sections.length === 0) {
      // Sin nada guardado, el estudio puede estar igual en IGDB.
      return (
        <div className="space-y-4">
          <GameResults hits={[]} query={query} scope={scope} />
          <p className="text-center type-caption text-ink-muted">
            <Link href={searchHref(query, "estudios")} className="text-accent-ink hover:underline">
              Buscar “{query}” en estudios
            </Link>
          </p>
        </div>
      );
    }
    return <div className="space-y-8">{sections}</div>;
  }

  if (tab === "juegos") {
    const result = await searchGames(supabase, userId, query);
    if (result.status === "error")
      return <ErrorState message="No pudimos buscar juegos. Probá de nuevo." />;
    return <GameResults hits={result.hits} query={query} scope={scope} />;
  }
  if (tab === "estudios") {
    const result = await searchStudios(supabase, query);
    return <StudioResults {...result} query={query} scope={scope} />;
  }
  if (tab === "listas") {
    return (
      <ListResults lists={await searchLists(supabase, userId, query)} query={query} scope={scope} />
    );
  }
  const result = await searchUsers(query);
  if (result.status === "error")
    return <ErrorState message="No pudimos buscar usuarios. Probá de nuevo." />;
  return <UserResults users={result.results} query={query} scope={scope} />;
}

function AllSection({
  scope,
  query,
  children,
}: {
  scope: Exclude<SearchScope, "todo">;
  query: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={SCOPE_LABELS[scope]} className="space-y-2">
      <SectionHeader
        title={SCOPE_LABELS[scope]}
        action={
          <Link href={searchHref(query, scope)}>
            <SectionAction>Ver todo</SectionAction>
          </Link>
        }
      />
      {children}
    </section>
  );
}
