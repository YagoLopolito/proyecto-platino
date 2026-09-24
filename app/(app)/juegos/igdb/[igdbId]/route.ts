import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { materializeIgdbGame } from "@/lib/catalog/materialize";

/**
 * Link estable a la ficha de un juego de IGDB (issue #193): los pósters del
 * perfil de un estudio linkean acá cuando el juego todavía no está en `games`.
 * Mismo contrato que `/juegos/catalogo/[rawgId]`: materializa y redirige.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/juegos/igdb/[igdbId]">) {
  const { igdbId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const id = Number(igdbId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return new NextResponse("Id de IGDB inválido.", { status: 404 });
  }

  const gameId = await materializeIgdbGame(id);
  if (!gameId) {
    return new NextResponse("No encontramos ese juego en IGDB.", { status: 404 });
  }

  return NextResponse.redirect(new URL(`/juegos/${gameId}`, request.url));
}
