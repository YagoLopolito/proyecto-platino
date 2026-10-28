import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * `NextResponse.next()` que le pasa al render los headers del request más
 * `extraRequestHeaders` (la CSP con el nonce, #222). Se arma de nuevo en cada
 * llamada a propósito: Supabase puede reescribir las cookies del request a
 * mitad de camino, y una copia hecha antes llegaría al render con el token
 * viejo.
 */
function nextWithHeaders(request: NextRequest, extraRequestHeaders: Record<string, string>) {
  const headers = new Headers(request.headers);
  for (const [name, value] of Object.entries(extraRequestHeaders)) headers.set(name, value);
  return NextResponse.next({ request: { headers } });
}

export async function updateSession(
  request: NextRequest,
  extraRequestHeaders: Record<string, string> = {},
) {
  let supabaseResponse = nextWithHeaders(request, extraRequestHeaders);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = nextWithHeaders(request, extraRequestHeaders);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No remover: refresca el token de sesión antes de que expire.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/registro") ||
    request.nextUrl.pathname.startsWith("/auth");

  const isProtectedRoute =
    request.nextUrl.pathname.startsWith("/perfil") ||
    request.nextUrl.pathname.startsWith("/juegos") ||
    request.nextUrl.pathname.startsWith("/biblioteca") ||
    request.nextUrl.pathname.startsWith("/buscar") ||
    request.nextUrl.pathname.startsWith("/actividad") ||
    request.nextUrl.pathname.startsWith("/psn") ||
    request.nextUrl.pathname.startsWith("/configuracion") ||
    request.nextUrl.pathname.startsWith("/listas") ||
    request.nextUrl.pathname.startsWith("/estudios") ||
    request.nextUrl.pathname.startsWith("/publicaciones") ||
    request.nextUrl.pathname.startsWith("/vitrina");

  if (!user && !isAuthRoute && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
