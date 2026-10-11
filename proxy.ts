import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security/csp";

/**
 * Rutas que dependen de sesión (protegidas o de auth): sólo ellas pagan el
 * round-trip a Supabase Auth. Antes esto era el `matcher`; desde #222 el
 * proxy corre en todas las páginas para ponerles la CSP con nonce, y la
 * sesión se sigue refrescando sólo acá.
 */
const SESSION_PATH_PREFIXES = [
  "/perfil",
  "/juegos",
  "/biblioteca",
  "/buscar",
  "/actividad",
  "/psn",
  "/configuracion",
  "/diario",
  "/listas",
  "/estudios",
  "/publicaciones",
  "/login",
  "/registro",
  "/auth",
];

function needsSession(pathname: string): boolean {
  return SESSION_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  const csp = buildContentSecurityPolicy({
    nonce: createNonce(),
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  // Next lee el nonce de la CSP del *request* y se lo pone a sus scripts; la
  // del *response* es la que hace cumplir el navegador. Tienen que ser la misma.
  const extraRequestHeaders = { "content-security-policy": csp };

  let response: NextResponse;
  if (needsSession(request.nextUrl.pathname)) {
    response = await updateSession(request, extraRequestHeaders);
  } else {
    const headers = new Headers(request.headers);
    headers.set("content-security-policy", csp);
    response = NextResponse.next({ request: { headers } });
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Todo menos lo que no es HTML: route handlers de `/api`, los assets con
    // hash de `/_next/static`, el optimizador de imágenes y cualquier archivo
    // con extensión (`/sw.js`, `/manifest.webmanifest`, íconos, `/logo.webp`).
    "/((?!api/|_next/static|_next/image|.*\\.(?:js|css|json|webmanifest|txt|xml|ico|png|jpg|jpeg|gif|svg|webp|avif|woff2?)$).*)",
  ],
};
