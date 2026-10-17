import type { MetadataRoute } from "next";

/**
 * Manifiesto de la PWA: es lo que hace que Platinoob se pueda "descargar" (en
 * realidad, instalar) en el celular desde el navegador, sin pasar por ninguna
 * tienda de aplicaciones.
 *
 * Los íconos son PNG commiteados en `public/` (los genera
 * `scripts/generate-icons.mjs`). Hacen falta los dos propósitos:
 * - `any`: el ícono tal cual, para iOS y para los listados de apps.
 * - `maskable`: Android recorta hasta un 20% de cada borde para adaptarlo a la
 *   forma del launcher; sin una versión maskable queda el ícono chico dentro
 *   de un círculo blanco.
 *
 * `start_url` es `/biblioteca` y no `/`: quien instala la app ya tiene cuenta, y la
 * landing sólo lo haría clickear "Entrar" cada vez. Si no hay sesión, el
 * middleware redirige a `/login` igual.
 */
/**
 * Versión de los íconos, en la query de cada `src`. Android no vuelve a bajar el
 * ícono de una app ya instalada si el manifest no cambia: con el mismo nombre
 * de archivo, regenerar los PNG no le llegaba a nadie que ya la tuviera
 * instalada. Subir este número cada vez que se corre
 * `scripts/generate-icons.mjs` cambia el manifest y dispara la actualización.
 */
const ICON_VERSION = 2;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Platinoob — Trophy Tracker",
    short_name: "Platinoob",
    description:
      "Seguí tu progreso de trofeos de PlayStation y logros de Steam, con guías y diario de partidas.",
    id: "/",
    start_url: "/biblioteca",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Splash = `--background`; barra del sistema = `--chrome` (el header),
    // para que la ventana instalada y la barra superior sean una sola franja.
    background_color: "#0f1721",
    theme_color: "#050c15",
    lang: "es",
    dir: "ltr",
    categories: ["games", "entertainment", "utilities"],
    icons: [
      {
        src: `/icon-192.png?v=${ICON_VERSION}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icon-512.png?v=${ICON_VERSION}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icon-maskable-512.png?v=${ICON_VERSION}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Mi biblioteca", url: "/biblioteca" },
      { name: "Diario", url: "/perfil/diario" },
      { name: "Perfil", url: "/perfil" },
    ],
  };
}
