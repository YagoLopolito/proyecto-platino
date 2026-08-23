import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ],
  },
};

export default nextConfig;
