import { redirect } from "next/navigation";
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
  tabOfScope,
  type SearchScope,
  type SearchTab,
} from "@/lib/search/scopes";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Buscar" };

/**
 * Buscar (epic #183, issue #194). Sin query: el campo enfocado y las
 * búsquedas recientes. Con query: tabs Juegos · Estudios · Listas · Usuarios,
 * con la búsqueda y la tab en la URL (`/buscar?q=insomniac&en=estudios`), así
 * sobrevive al refresh y "atrás" funciona. Sólo se consulta la tab abierta.
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
  const tab = tabOfScope(scope);

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
          activeHref={searchHref(query, tab)}
        >
          <div className="mx-auto w-full max-w-5xl px-4 py-4">
            <TabResults tab={tab} query={query} scope={scope} userId={user.id} />
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

async function TabResults({
  tab,
  query,
  scope,
  userId,
}: {
  tab: SearchTab;
  query: string;
  scope: SearchScope;
  userId: string;
}) {
  const supabase = await createClient();

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
