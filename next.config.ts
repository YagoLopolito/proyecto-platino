import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Hosts conocidos de donde vienen las carátulas/íconos (PSN, RAWG, SteamGridDB).
    // Sin esto, next/image rechaza el host y forzaba `unoptimized` en todos lados.
    // "**" (no "*") porque las URLs reales vienen de subdominios de más de un nivel
    // (ej. image.api.playstation.com) -- "*.playstation.com" solo matchea un nivel.
    // PSN sirve imágenes desde DOS dominios distintos y hay que cubrir ambos TLD:
    // image.api.playstation.com (.com) y psnobj.prod.dl.playstation.net (.net)
    // -- confirmado consultando cover_url/icon_url reales en la base.
    remotePatterns: [
      { protocol: "https", hostname: "**.playstation.com" },
      { protocol: "https", hostname: "**.playstation.net" },
      { protocol: "https", hostname: "**.rawg.io" },
      { protocol: "https", hostname: "**.steamgriddb.com" },
    ],
  },
};

export default nextConfig;
