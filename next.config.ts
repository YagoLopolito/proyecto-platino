import type { NextConfig } from "next";

/**
 * Identidad del deploy. En Vercel es el SHA del commit, así que cambia con
 * cada merge de un PR: es lo que le permite a la app instalada en el celular
 * detectar que hay una versión nueva (ver `components/pwa/PwaRuntime.tsx`).
 */
const buildId = process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";

/**
 * Cabeceras de seguridad que van en todas las respuestas (issue #131).
 *
 * - HSTS **sin `preload`**: en `*.vercel.app` no aplica, y con un dominio
 *   propio compromete todos los subdominios y es muy difícil de revertir.
 * - `Permissions-Policy` apaga lo que la app no usa: la galería y el importador
 *   de capturas suben archivos con un `<input type="file">`, no con la cámara.
 * - `X-Frame-Options: DENY`: nadie embebe la app en un iframe (clickjacking
 *   sobre "Desconectar", "Borrar" o el flujo de Steam OpenID).
 */
const SECURITY_HEADERS = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Horneado en el bundle del cliente para poder compararlo contra el que
  // devuelve /api/version, que siempre es el del deploy vivo.
  env: { NEXT_PUBLIC_BUILD_ID: buildId },

  // Sólo se pisa en Vercel: en local, dejar que Next genere uno distinto por
  // build mantiene el cache-busting de los assets con hash.
  ...(process.env.VERCEL_GIT_COMMIT_SHA ? { generateBuildId: async () => buildId } : {}),

  /*
   * Rutas viejas de la navegación de 4 tabs (epic #183, issue #185). Van acá y
   * no como `redirect()` dentro de una página porque Next pasa la query string
   * sola al destino: `/juegos?fuente=steam&q=zelda` llega a
   * `/biblioteca?fuente=steam&q=zelda` y `/diario?nuevo=1` sigue abriendo el
   * modal, sin copiar parámetros a mano. Corren antes del middleware.
   *
   * No son permanentes (307, no 308): la estructura todavía se está armando
   * sub-issue por sub-issue, y un 308 queda cacheado en el navegador.
   *
   * `/juegos/[id]` NO se redirige: la ficha de juego sigue viviendo ahí.
   * `/diario/resumen` y `/diario/capturas` tampoco: se linkean desde el diario
   * del perfil.
   */
  async redirects() {
    return [
      { source: "/juegos", destination: "/biblioteca", permanent: false },
      { source: "/diario", destination: "/perfil/diario", permanent: false },
      { source: "/diario/amigos", destination: "/biblioteca/resenas", permanent: false },
      // Ficha de juego unificada (issue #186): la de diario y la de enlaces
      // pasaron a ser tabs de `/juegos/[id]`. Trofeos es la default y Reseñas
      // vive en `/resenas`; `/trofeos` quedó como alias viejo.
      { source: "/juegos/:id/diario", destination: "/juegos/:id/resenas", permanent: false },
      { source: "/juegos/:id/trofeos", destination: "/juegos/:id", permanent: false },
      { source: "/juegos/:id/enlaces", destination: "/juegos/:id/guias", permanent: false },
      // El expandido de Platinos del perfil pasó a ser la Vitrina.
      { source: "/perfil/platinos", destination: "/vitrina", permanent: false },
    ];
  },

  async headers() {
    return [
      {
        // Cabeceras de seguridad para toda la app (issue #131). La CSP no está
        // acá a propósito: sin nonces, Next necesita 'unsafe-inline' y una CSP
        // mal armada rompe la app entera (seguimiento en #222).
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        // El service worker es un archivo estático de `public/`, que Vercel
        // sirve con caché larga por defecto. Si se cachea, un cambio en el SW
        // puede tardar días en llegar a los celulares ya instalados.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          // Sin esto el scope máximo del SW sería el directorio del archivo;
          // acá coincide con la raíz, pero queda explícito para que mover el
          // archivo no rompa el registro en silencio.
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },

  images: {
    // Hosts conocidos de donde vienen las carátulas/íconos (PSN, RAWG, SteamGridDB).
    // Sin esto, next/image rechaza el host y forzaba `unoptimized` en todos lados.
    remotePatterns: [
      // next/image sólo matchea un nivel de subdominio con "*.", por eso van
      // los hosts reales completos (verificados en la tabla `games`/`trophies`)
      // en vez de "*.playstation.com" / "*.playstation.net".
      { protocol: "https", hostname: "*.playstation.com" },
      { protocol: "https", hostname: "image.api.playstation.com" },
      { protocol: "https", hostname: "psnobj.prod.dl.playstation.net" },
      // Avatares: PSN los sirve por http (no https). Son dos hosts distintos
      // según de dónde salga el avatar (los clásicos vs. los de juegos), y si
      // falta uno next/image rechaza la URL y la imagen no carga.
      { protocol: "http", hostname: "static-resource.np.community.playstation.net" },
      { protocol: "http", hostname: "psn-rsc.prod.dl.playstation.net" },
      { protocol: "https", hostname: "psn-rsc.prod.dl.playstation.net" },
      { protocol: "https", hostname: "*.rawg.io" },
      { protocol: "https", hostname: "*.steamgriddb.com" },
      // Wallpapers (library_hero) de la CDN pública de Steam, ver lib/covers.
      { protocol: "https", hostname: "cdn.cloudflare.steamstatic.com" },
      { protocol: "https", hostname: "shared.cloudflare.steamstatic.com" },
      // Íconos de juegos y de logros, y avatares, del sync de Steam (lib/steam).
      // El host viejo de Akamai se normaliza a cdn.cloudflare.steamstatic.com al
      // sincronizar (ver lib/steam/achievements.ts); queda igual acá porque las
      // filas viejas pueden seguir apuntando ahí.
      { protocol: "https", hostname: "steamcdn-a.akamaihd.net" },
      { protocol: "https", hostname: "avatars.steamstatic.com" },
      { protocol: "https", hostname: "avatars.cloudflare.steamstatic.com" },
      { protocol: "https", hostname: "media.steampowered.com" },
      { protocol: "https", hostname: "cdn.akamai.steamstatic.com" },
      // Capturas que suben los usuarios (bucket público de Supabase Storage).
      { protocol: "https", hostname: "*.supabase.co" },
      // Carátulas y logos de estudios de IGDB (issue #193).
      { protocol: "https", hostname: "images.igdb.com" },
    ],
  },
};

export default nextConfig;
