/**
 * Content-Security-Policy con nonce por request (issue #222, seguimiento de
 * #131). Puro y sin `server-only`: lo arma el middleware y se testea directo
 * desde el spec.
 *
 * Lo que importa es `script-src`: sin `'unsafe-inline'`, un XSS que logre
 * inyectar un `<script>` no corre, porque no tiene el nonce de esa respuesta.
 * Next lee el nonce de esta cabecera en el request y se lo pone solo a sus
 * scripts (runtime, bundles de la página, el payload de RSC). Con
 * `'strict-dynamic'`, lo que esos scripts cargan después (chunks de rutas)
 * hereda la confianza sin listar hosts.
 *
 * Lo demás es deliberadamente más laxo, porque un error acá rompe la app en
 * silencio y no es por donde entra un XSS:
 * - `style-src 'unsafe-inline'`: un nonce no cubre los atributos `style="…"`
 *   que React renderiza en el server (barras de progreso, proporciones del
 *   carrusel), ni los `<style>` de `next/font`.
 * - `img-src https:`: el arte de juego sale de una docena de CDNs (PSN, RAWG,
 *   SteamGridDB, Steam, IGDB) y va con `unoptimized` (ver `GameArt`), así que
 *   cualquier host nuevo en la base quedaría como placeholder sin que nadie se
 *   entere. Los avatares de PSN llegan por http desde dos hosts conocidos.
 */

/** Hosts de avatares de PSN que sólo sirven por http (ver `next.config.ts`). */
const PSN_HTTP_IMAGE_HOSTS = [
  "http://static-resource.np.community.playstation.net",
  "http://psn-rsc.prod.dl.playstation.net",
];

export type CspOptions = {
  nonce: string;
  /** React usa `eval` en desarrollo para reconstruir stacks; nunca en producción. */
  isDev: boolean;
  /** `NEXT_PUBLIC_SUPABASE_URL`: auth, PostgREST, Storage (TUS) y las URLs firmadas. */
  supabaseUrl?: string;
};

/** Un nonce nuevo por request: 128 bits aleatorios en base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy({ nonce, isDev, supabaseUrl }: CspOptions): string {
  const supabase = originOf(supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:", ...PSN_HTTP_IMAGE_HOSTS],
    // Videos de la Galería online: URLs firmadas de Storage y, en el
    // compositor, la vista previa local (`blob:`).
    "media-src": ["'self'", "blob:", ...(supabase ? [supabase] : [])],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(supabase && supabaseWs ? [supabase, supabaseWs] : [])],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    // Mismo criterio que `X-Frame-Options: DENY` (#131), para los navegadores
    // que ya sólo miran la CSP.
    "frame-ancestors": ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
