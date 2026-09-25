import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveRecentSearch } from "@/lib/search/save";
import { parseSearchScope, safeInternalPath, searchHref } from "@/lib/search/scopes";

/**
 * Guarda la búsqueda en recientes y redirige (epic #183, issue #194). Es la
 * única forma de guardar: al abrir un resultado (`to` = su ficha) y al apretar
 * Enter (sin `to`, vuelve a los resultados). Nunca en cada tecla.
 *
 * Es un GET que escribe, como `/juegos/catalogo/[rawgId]`: por eso quien
 * linkea acá usa un `<a>` común y no `<Link>`, que lo prefetchearía y
 * guardaría búsquedas que nadie abrió.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = (params.get("q") ?? "").trim();
  const scope = parseSearchScope(params.get("en"));
  const target = safeInternalPath(params.get("to")) ?? searchHref(query, scope);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  // Guardar va con `after()`: se escribe después de mandar el redirect, así
  // abrir un resultado no espera a la base (era un round-trip más antes de
  // empezar a cargar la ficha).
  if (query) after(() => saveRecentSearch(supabase, query, scope));
  return NextResponse.redirect(new URL(target, request.url), 303);
}
