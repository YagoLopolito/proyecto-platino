import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { materializeCatalogGame } from "@/lib/catalog/materialize";

/**
 * Link estable a la ficha de un juego del catálogo externo (RAWG), lo tenga o
 * no alguien en la base (epic #183, issue #186). La búsqueda, las listas y los
 * estudios linkean acá con el id de RAWG; esto materializa la fila de `games`
 * si hace falta y redirige a `/juegos/[id]`.
 *
 * Es un route handler y no una página porque no renderiza nada: es un GET que
 * escribe y redirige. Exige sesión aunque el middleware ya la pida, porque la
 * escritura va por service role y no puede quedar abierta a cualquiera.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/juegos/catalogo/[rawgId]">) {
  const { rawgId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const gameId = await materializeCatalogGame(rawgId);
  if (!gameId) {
    return new NextResponse("No encontramos ese juego en el catálogo.", { status: 404 });
  }

  return NextResponse.redirect(new URL(`/juegos/${gameId}`, request.url));
}
