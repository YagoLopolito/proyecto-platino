/**
 * Rutas de los assets del platino, en un solo lugar para poder cambiarlas
 * juntas. Puro y sin `server-only`: lo usan componentes cliente.
 *
 * El ícono y el sonido oficiales de PlayStation los aporta a mano el dueño del
 * proyecto (no se descargan ni se generan). El trofeo ya está commiteado
 * (512px, PNG cuantizado); si alguna vez no carga, cae a
 * `PLATINUM_TROPHY_FALLBACK_SRC` (la misma imagen en WebP, la de Actividad) y
 * después al trofeo vectorial. Sin el sonido no pasa nada.
 *
 * Son assets de Sony: si la app se hace pública y masiva, conviene
 * reemplazarlos por diseño propio (mismo criterio que los logos de
 * plataforma, ver "Iconografía" en CLAUDE.md).
 */
export const PLATINUM_TROPHY_SRC = "/trophies/platinum.png";
export const PLATINUM_TROPHY_FALLBACK_SRC = "/trophy-platinum.webp";
export const PLATINUM_SOUND_SRC = "/sounds/platinum.mp3";

/**
 * Volumen del sonido según dónde suena: entero en la celebración de un platino
 * nuevo, más bajo cada vez que se entra a un juego platinado.
 */
export const PLATINUM_SOUND_VOLUME = { celebration: 0.6, rain: 0.25 } as const;

const missingAssets = new Set<string>();

/** Si un asset ya dio error en esta sesión (para no volver a pedirlo). */
export function isPlatinumAssetMissing(path: string): boolean {
  return missingAssets.has(path);
}

/**
 * Registra que falta un asset oficial y lo avisa en desarrollo (y sólo ahí),
 * una vez por asset.
 */
export function warnMissingPlatinumAsset(path: string): void {
  if (missingAssets.has(path)) return;
  missingAssets.add(path);
  if (process.env.NODE_ENV !== "development") return;
  console.warn(
    `[platino] TODO: falta public${path}. Se usa el fallback hasta que se agregue el asset oficial.`,
  );
}

/**
 * La copa de `TrophyVectorIcon` (viewBox 24×24), para dibujarla en el canvas de
 * la lluvia cuando no carga ninguna imagen.
 */
export const TROPHY_VECTOR_PATH =
  "M6 3h12v2h2a1 1 0 0 1 1 1v1c0 2.5-1.7 4.6-4 5.3-.7 1.6-2.1 2.8-3.8 3.2V18h2.3a1 1 0 0 1 1 1v1H8.5v-1a1 1 0 0 1 1-1H11.8v-2.5c-1.7-.4-3.1-1.6-3.8-3.2C5.7 11.6 4 9.5 4 7V6a1 1 0 0 1 1-1h1V3Zm0 4H5v0c0 1.5.8 2.8 2 3.6V7Zm12 0v3.6c1.2-.8 2-2.1 2-3.6h-1V7h-1Z";
