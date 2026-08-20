import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Hosts conocidos de donde vienen las carátulas/íconos (PSN, RAWG, SteamGridDB).
    // Sin esto, next/image rechaza el host y forzaba `unoptimized` en todos lados.
    remotePatterns: [
      { protocol: "https", hostname: "*.playstation.com" },
      { protocol: "https", hostname: "*.rawg.io" },
      { protocol: "https", hostname: "*.steamgriddb.com" },
    ],
  },
};

export default nextConfig;
