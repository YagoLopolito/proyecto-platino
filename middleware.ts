import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Solo rutas que dependen de sesión (protegidas o de auth). El resto de la app
  // (landing, estáticos, etc.) no necesita el round-trip a Supabase Auth en cada request.
  matcher: [
    "/perfil/:path*",
    "/juegos/:path*",
    "/biblioteca/:path*",
    "/buscar/:path*",
    "/actividad/:path*",
    "/psn/:path*",
    "/configuracion/:path*",
    "/diario/:path*",
    "/listas/:path*",
    "/login",
    "/registro",
    "/auth/:path*",
  ],
};
