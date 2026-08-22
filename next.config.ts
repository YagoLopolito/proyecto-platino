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
    ],
  },
};

export default nextConfig;
