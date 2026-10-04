import type { ReactNode } from "react";

/**
 * Set de íconos propio, para sacar los emojis de la interfaz.
 *
 * Por qué importa: un emoji se renderiza distinto en cada sistema operativo
 * (el 🏆 de Android no se parece al de iOS ni al de Windows), viene con su
 * propio color y no toma el del tema, así que queda como una calcomanía
 * pegada encima del diseño. Es el tell más fuerte de "esto lo generó una IA"
 * (issue #176 §3.3).
 *
 * Convenciones del set:
 * - viewBox 24×24, la misma métrica que los íconos de `MobileTabBar`.
 * - `fill="currentColor"`: el color lo decide quien lo usa, con un token.
 * - `fill-rule="evenodd"`: los huecos (la cruceta del joystick, la pantalla
 *   del monitor) se dibujan como subpath y se recortan solos, sin depender de
 *   la dirección en que quedó escrita la curva.
 *
 * Los íconos de trofeo POR TIPO no están acá: viven en
 * `components/TrophyTypeIcon.tsx`, porque lo que los distingue es el color
 * canónico de cada tipo y no la forma.
 *
 * Las plataformas van con un gamepad y un monitor genéricos, no con los logos
 * de PlayStation y Steam: son marcas registradas y no tenemos licencia para
 * reproducirlas (mismo criterio que ya documenta `TrophyTypeIcon` sobre el
 * asset oficial de Sony).
 */
export const ICON_NAMES = [
  "trophy",
  "completed",
  "sparkle",
  "target",
  "clock",
  "gamepad",
  "monitor",
  "alert",
  "flame",
  "bulb",
  "list",
  "repeat",
  "link",
  "book",
  "help",
  "star",
  "camera",
  "chart",
  "note",
  "user",
  "users",
  "settings",
  "download",
  "offline",
  "search",
  "arrow-down",
  "close",
  "expand",
  "chevron-down",
  "chevron-right",
  "filters",
  "check",
  "arrow-left",
  "arrow-right",
  "plus",
  "logout",
  "library",
  "plus-circle",
  "bolt",
  "playlist-add",
  "playlist-check",
  "heart",
  "heart-outline",
  "lock",
  "more",
  "carousel",
  "play",
  "comment",
  "image",
  "volume",
  "volume-off",
  "arrow-up",
  "upload",
  "edit",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/**
 * Los íconos de CHROME (lupa, ✕, chevron, tilde) se dibujan con trazo y no con
 * relleno: son líneas, y a 14-16px un contorno de 2px se lee mucho mejor que
 * una silueta rellena. Los de CONTENIDO (trofeo, 100%, IA) siguen siendo
 * sólidos, que es lo que los hace legibles como marca sobre una carátula.
 *
 * Estaban duplicados a mano en `Modal`, `SearchField`, `Select`, `ToggleChip`
 * y `MobileDisclosure` -- cinco copias del mismo chevron con tres grosores
 * distintos. Acá hay una sola.
 */
const STROKE_ICONS = new Set<IconName>([
  "search",
  "close",
  "chevron-down",
  "chevron-right",
  "filters",
  "check",
  "arrow-down",
  "arrow-left",
  "arrow-right",
  "plus",
  "logout",
  "heart-outline",
  "expand",
  "volume",
  "volume-off",
  "arrow-up",
  "upload",
  "edit",
]);

const PATHS: Record<IconName, ReactNode> = {
  /** Copa estilizada. Misma forma que `TrophyTypeIcon`, para que el set sea uno solo. */
  trophy: (
    <path d="M6 3h12v2h2a1 1 0 0 1 1 1v1c0 2.5-1.7 4.6-4 5.3-.7 1.6-2.1 2.8-3.8 3.2V18h2.3a1 1 0 0 1 1 1v1H8.5v-1a1 1 0 0 1 1-1H11.8v-2.5c-1.7-.4-3.1-1.6-3.8-3.2C5.7 11.6 4 9.5 4 7V6a1 1 0 0 1 1-1h1V3Zm0 4H5v0c0 1.5.8 2.8 2 3.6V7Zm12 0v3.6c1.2-.8 2-2.1 2-3.6h-1V7h-1Z" />
  ),
  /** 100% de logros (el equivalente al platino en Steam). */
  completed: (
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.7 7.7-5.4 5.4a1 1 0 0 1-1.4 0l-2.6-2.6a1 1 0 1 1 1.4-1.4l1.9 1.9 4.7-4.7a1 1 0 1 1 1.4 1.4Z" />
  ),
  /** Contenido generado por IA. Reemplaza al ✨. */
  sparkle: (
    <>
      <path d="M11 2.5 12.9 8l5.6 1.9-5.6 1.9L11 17.5l-1.9-5.6L3.5 10l5.6-1.9L11 2.5Z" />
      <path d="M18.5 14.5 19.3 17l2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.5Z" />
    </>
  ),
  /** Objetivo a acumular (los contadores del advisor). Reemplaza al 🎯. */
  target: (
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
  ),
  /** Tiempo estimado de juego. */
  clock: (
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 4a1 1 0 1 0-2 0v6a1 1 0 0 0 .5.87l4 2.3a1 1 0 0 0 1-1.73L13 11.42V6Z" />
  ),
  /** Juego / plataforma de consola. Reemplaza al 🎮. */
  gamepad: (
    <path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm3 3v2H5v2h2v2h2v-2h2v-2H9V9H7Zm9 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm-2 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
  ),
  /** Plataforma de PC (Steam). */
  monitor: (
    <path d="M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-8v2h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v9h16V6H4Z" />
  ),
  /** Trofeo perdible (missable) del advisor. Reemplaza al ⚠️. */
  alert: (
    <path d="M12 2.6a1.5 1.5 0 0 1 1.3.76l8.5 15A1.5 1.5 0 0 1 20.5 20.6h-17a1.5 1.5 0 0 1-1.3-2.24l8.5-15A1.5 1.5 0 0 1 12 2.6Zm-1 5.9v5a1 1 0 1 0 2 0v-5a1 1 0 1 0-2 0Zm1 7.1a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z" />
  ),
  /** Trofeo que exige dificultad, contrarreloj o no morir. Reemplaza al 🔥. */
  flame: (
    <path d="M13 2c.3 3-1.2 4.6-2.7 6.1C8.7 9.7 7 11.4 7 14.2A5.8 5.8 0 0 0 12.8 20a5.5 5.5 0 0 0 5.5-5.5c0-4-2.7-6.2-4.3-8.2A7.4 7.4 0 0 1 13 2Zm-.3 10c.2 1.4-.4 2-1 2.6-.5.6-1 1.2-1 2.1a2.2 2.2 0 0 0 4.4 0c0-1.5-1-2.3-1.7-3.1a3.6 3.6 0 0 1-.7-1.6Z" />
  ),
  /** Tips generales del advisor. Reemplaza al 💡. */
  bulb: (
    <path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2ZM9.5 19.5a1 1 0 0 0 0 2h5a1 1 0 1 0 0-2h-5Z" />
  ),
  /** Orden sugerido del advisor. Reemplaza al 📋. */
  list: (
    <path d="M4 5.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm5.5-1h10a1 1 0 1 1 0 2h-10a1 1 0 1 1 0-2ZM4 12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm5.5-1h10a1 1 0 1 1 0 2h-10a1 1 0 1 1 0-2ZM4 18.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm5.5-1h10a1 1 0 1 1 0 2h-10a1 1 0 1 1 0-2Z" />
  ),
  /** El juego necesita más de una partida. Reemplaza al 🔁. */
  repeat: (
    <path d="M7 5h9a5 5 0 0 1 5 5 1 1 0 1 1-2 0 3 3 0 0 0-3-3H7.4l1.3 1.3a1 1 0 1 1-1.4 1.4l-3-3a1 1 0 0 1 0-1.4l3-3a1 1 0 0 1 1.4 1.4L7.4 5H7Zm10 14H8a5 5 0 0 1-5-5 1 1 0 1 1 2 0 3 3 0 0 0 3 3h8.6l-1.3-1.3a1 1 0 0 1 1.4-1.4l3 3a1 1 0 0 1 0 1.4l-3 3a1 1 0 0 1-1.4-1.4l1.3-1.3H17Z" />
  ),
  /** Enlaces externos de un juego. Reemplaza al 🔗. */
  link: (
    <path d="M10.6 13.4a1 1 0 0 1 0-1.4l1.4-1.4a1 1 0 0 1 1.4 1.4l-1.4 1.4a1 1 0 0 1-1.4 0Zm-.7 3.5-1.8 1.8a2.5 2.5 0 0 1-3.5-3.5l3.2-3.2a2.5 2.5 0 0 1 3.5 0 1 1 0 0 0 1.4-1.4 4.5 4.5 0 0 0-6.3 0l-3.2 3.2a4.5 4.5 0 0 0 6.3 6.3l1.8-1.8a1 1 0 0 0-1.4-1.4Zm10.5-11a4.5 4.5 0 0 0-6.3 0l-1.8 1.8a1 1 0 0 0 1.4 1.4l1.8-1.8a2.5 2.5 0 0 1 3.5 3.5l-3.2 3.2a2.5 2.5 0 0 1-3.5 0 1 1 0 1 0-1.4 1.4 4.5 4.5 0 0 0 6.3 0l3.2-3.2a4.5 4.5 0 0 0 0-6.3Z" />
  ),
  /** Diario del juego. Reemplaza al 📔. */
  book: (
    <path d="M6 2h13a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v11.2c.3-.1.6-.2 1-.2h12V4H6Zm0 14a1 1 0 1 0 0 2h12v-2H6Z" />
  ),
  /** "Cómo desbloquearlo". Reemplaza al ❓. */
  help: (
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM9.2 9.3a2.9 2.9 0 1 1 3.9 2.7c-.5.2-.6.4-.6.6v.6a1 1 0 1 1-2 0v-.6c0-1.2.8-2 1.7-2.4a.9.9 0 1 0-1.2-.9 1 1 0 1 1-2 0Zm2.8 6.1a1.2 1.2 0 1 0 0 2.5 1.2 1.2 0 0 0 0-2.5Z" />
  ),

  /**
   * Estrella del rating del diario. Reemplaza a los glifos ★/☆, que son
   * dingbats: cada sistema los dibuja con su propia forma y su propio ancho,
   * así que las cinco estrellas no quedaban alineadas entre dispositivos.
   * La media estrella no es un ícono aparte: se recorta este mismo al 50%
   * (ver `StarRating`), que es lo único que garantiza que las dos mitades
   * sean exactamente la misma forma.
   */
  star: (
    <path d="M12 2.6a1 1 0 0 1 .9.57l2.36 4.9 5.32.77a1 1 0 0 1 .56 1.7l-3.86 3.8.91 5.35a1 1 0 0 1-1.45 1.05L12 18.2l-4.74 2.54a1 1 0 0 1-1.45-1.05l.9-5.35-3.85-3.8a1 1 0 0 1 .56-1.7l5.32-.77 2.36-4.9a1 1 0 0 1 .9-.57Z" />
  ),
  /** Capturas de pantalla del juego. Reemplaza al 📷. */
  camera: (
    <path d="M9.4 3h5.2a1 1 0 0 1 .84.46L16.5 5H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.5l1.06-1.54A1 1 0 0 1 9.4 3Zm2.6 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
  ),
  /** Resumen con estadísticas del año. Reemplaza al 📊. */
  chart: (
    <path d="M4 3a1 1 0 0 1 1 1v15h15a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm4 9a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0v-3a1 1 0 0 1 1-1Zm4-5a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm4 3a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0v-5a1 1 0 0 1 1-1Zm4-5a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Z" />
  ),
  /** La entrada de diario tiene reseña escrita. Reemplaza al 📝. */
  note: (
    <path d="M5 3h9.6a1 1 0 0 1 .7.3l3.4 3.4a1 1 0 0 1 .3.7V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 6a1 1 0 0 0 0 2h8a1 1 0 1 0 0-2H8Zm0 4a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2H8Zm0 4a1 1 0 1 0 0 2h5a1 1 0 1 0 0-2H8Z" />
  ),

  /* --- Navegación y estados (fase 5) ------------------------------------ */
  /** Perfil propio (tab de la barra inferior). */
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2.2-7 5v1h14v-1c0-2.8-3-5-7-5Z" />,
  /** Amigos: el estado vacío de la fila de amigos y del feed. */
  users: (
    <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 13c-3.6 0-6.5 2-6.5 4.6V19h13v-1.4C15.5 15 12.6 13 9 13Zm7 .5c-.6 0-1.2.1-1.7.2 1.6 1 2.7 2.4 2.7 4V19h4.5v-1.2c0-2.4-2.5-4.3-5.5-4.3Z" />
  ),
  /** Configuración (tab de la barra inferior). */
  settings: (
    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-1.4-8h2.8l.4 2.3c.5.2 1 .4 1.4.7l2.1-1 1.4 2.4-1.7 1.5c0 .3.1.6.1.9s0 .6-.1.9l1.7 1.5-1.4 2.4-2.1-1c-.4.3-.9.5-1.4.7l-.4 2.3h-2.8l-.4-2.3c-.5-.2-1-.4-1.4-.7l-2.1 1-1.4-2.4 1.7-1.5a5.6 5.6 0 0 1 0-1.8L3.3 6.4l1.4-2.4 2.1 1c.4-.3.9-.5 1.4-.7L10.6 2Z" />
  ),
  /** Instalar la app en el celular. */
  download: (
    <path d="M12 2a1 1 0 0 1 1 1v9.6l2.3-2.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L11 12.6V3a1 1 0 0 1 1-1ZM4 15a1 1 0 0 1 1 1v3h14v-3a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z" />
  ),
  /** Sin conexión. Reemplaza al 📡 de la pantalla offline. */
  offline: (
    <path d="M3.3 2.3a1 1 0 0 1 1.4 0l17 17a1 1 0 0 1-1.4 1.4l-3.9-3.9A9 9 0 0 0 12 15a9 9 0 0 0-6.4 2.6 1 1 0 1 1-1.4-1.4A11 11 0 0 1 12 13c.7 0 1.4.1 2.1.2l-2.3-2.3A15 15 0 0 0 3.5 14a1 1 0 1 1-1.3-1.5 17 17 0 0 1 7.6-3.8L3.3 3.7a1 1 0 0 1 0-1.4ZM12 4c3.8 0 7.4 1.4 10.2 3.8a1 1 0 1 1-1.3 1.5A13 13 0 0 0 12 6c-.9 0-1.8.1-2.7.3L7.7 4.7C9.1 4.2 10.5 4 12 4Zm0 4c2.5 0 4.9.9 6.8 2.4a1 1 0 1 1-1.3 1.5A9 9 0 0 0 12 10h-.4l-1.9-1.9c.8-.1 1.5-.1 2.3-.1Zm0 11a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
  ),

  /* --- Barra de 5 botones (epic #183, issue #185) ----------------------- */
  /** Biblioteca: dos pósters apilados, la unidad visual de la app. */
  library: (
    <>
      <path d="M8 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-1V5H8V4Z" />
      <path d="M4 7h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
    </>
  ),
  /**
   * El botón + del centro de la barra (registrar). Sólido y no el `plus` de
   * trazo: es la acción principal y tiene que pesar más que los otros cuatro.
   */
  "plus-circle": (
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5a1 1 0 1 0-2 0v4H7a1 1 0 1 0 0 2h4v4a1 1 0 1 0 2 0v-4h4a1 1 0 1 0 0-2h-4V7Z" />
  ),
  /** Actividad: lo que pasó hace poco (reseñas de amigos, tus logros, likes). */
  bolt: (
    <path d="M13.6 2.2a.6.6 0 0 1 1 .5L13.4 10H19a.6.6 0 0 1 .5 1l-9.1 10.8a.6.6 0 0 1-1-.5l1.2-7.3H5a.6.6 0 0 1-.5-1l9.1-10.8Z" />
  ),

  /* --- Playlist (epic #183, issue #188) ---------------------------------- */
  /** Agregar a la Playlist: la lista con un + (todavía no está). */
  "playlist-add": (
    <path d="M3 6h12v2H3V6Zm0 5h12v2H3v-2Zm0 5h8v2H3v-2Zm14-2v-3h2v3h3v2h-3v3h-2v-3h-3v-2h3Z" />
  ),
  /** Ya está en la Playlist: la misma lista con un tilde en vez del +. */
  "playlist-check": (
    <path d="M3 6h12v2H3V6Zm0 5h12v2H3v-2Zm0 5h8v2H3v-2Zm10.3 1.3 1.4-1.4 2.3 2.3 4.3-4.3 1.4 1.4-5.7 5.7-3.7-3.7Z" />
  ),

  /* --- Likes (epic #183, issue #190) ------------------------------------ */
  /** Ya le diste me gusta: el corazón relleno, en el token `like`. */
  heart: (
    <path d="M12 20.5 10.7 19.3C6 15.1 3 12.4 3 8.9 3 6.1 5.2 4 7.9 4c1.6 0 3.1.7 4.1 1.9C13 4.7 14.5 4 16.1 4 18.8 4 21 6.1 21 8.9c0 3.5-3 6.2-7.7 10.4L12 20.5Z" />
  ),

  /* --- Chrome (trazo, ver STROKE_ICONS) --------------------------------- */
  /** Buscador. */
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  /** Cerrar un modal, limpiar un campo. Reemplaza al carácter ✕ suelto. */
  close: <path d="M6 6l12 12M18 6 6 18" />,
  /** Ver una imagen en pantalla completa. */
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  /** Desplegable: `<select>`, disclosure de filtros. */
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  /** Fila de menú que abre otra pantalla (estadísticas del perfil). */
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  /** Abre los filtros plegados en mobile. */
  filters: <path d="M4 6h16M7 12h10M10 18h4" />,
  /** Opción activada de un `ToggleChip`. */
  check: <path d="m5 13 4 4L19 7" />,
  /** Dirección del orden de un listado: apunta abajo, rota 180° para "asc". */
  "arrow-down": <path d="M12 5v14M6 13l6 6 6-6" />,
  /** Volver a la pantalla anterior. Reemplaza al carácter ← suelto. */
  "arrow-left": <path d="M19 12H5M11 6l-6 6 6 6" />,
  /** Siguiente (la navegación del lightbox de capturas). */
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  /** "Agregar a amigos". Reemplaza al "+" tipeado adelante del texto. */
  plus: <path d="M12 5v14M5 12h14" />,
  /** Cerrar sesión. */
  logout: <path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l4 4-4 4M19 12H9" />,
  /**
   * Todavía no le diste me gusta: el mismo corazón que `heart`, en contorno.
   * Es la única forma de contenido que tiene versión de trazo, porque el par
   * relleno/contorno ES el estado del toggle (además de `aria-pressed`).
   */
  "heart-outline": (
    <path d="M12 20.5 10.7 19.3C6 15.1 3 12.4 3 8.9 3 6.1 5.2 4 7.9 4c1.6 0 3.1.7 4.1 1.9C13 4.7 14.5 4 16.1 4 18.8 4 21 6.1 21 8.9c0 3.5-3 6.2-7.7 10.4L12 20.5Z" />
  ),
  /** Lista privada (#197): sólo la ve su dueño. */
  lock: (
    <path d="M12 2a5 5 0 0 0-5 5v3H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V11a1 1 0 0 0-1-1h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Zm3 4a1.5 1.5 0 0 1 1 2.6V18a1 1 0 1 1-2 0v-1.4a1.5 1.5 0 0 1 1-2.6Z" />
  ),
  /** Menú ⋮ de acciones secundarias de una pantalla (#197). Tres puntos sólidos. */
  more: (
    <path d="M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
  ),

  /* --- Galería online ---------------------------------------------------- */
  /** Publicación con varios archivos (esquina de la celda de la grilla). */
  carousel: (
    <path d="M8 3h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-1V7a2 2 0 0 0-2-2H7V4a1 1 0 0 1 1-1ZM4 7h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
  ),
  /** Publicación (o archivo) que es un video. */
  play: <path d="M8 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 8 4.5Z" />,
  /** Comentarios de una publicación. */
  comment: (
    <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm2 3v2h12V7H6Zm0 4v2h8v-2H6Z" />
  ),
  /** Foto (estado vacío de la galería, zona de carga). */
  image: (
    <path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v9.6l3.3-3.3a1 1 0 0 1 1.4 0L13 15.6l2.3-2.3a1 1 0 0 1 1.4 0L19 15.6V6H5Zm10 1.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Z" />
  ),
  /** Sonido activado de un video. */
  volume: <path d="M4 9v6h4l5 4V5L8 9H4ZM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />,
  /** Sonido apagado (el autoplay del feed arranca así). */
  "volume-off": <path d="M4 9v6h4l5 4V5L8 9H4ZM17 9l5 6M22 9l-5 6" />,
  /** Subir un archivo una posición en el carrusel del compositor. */
  "arrow-up": <path d="M12 19V5M6 11l6-6 6 6" />,
  /** Elegir archivos para subir. */
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  /** Editar una publicación propia. */
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />,
};

/**
 * Un ícono del set.
 *
 * Sin `label` el ícono es decorativo y se esconde de los lectores de pantalla
 * (`aria-hidden`), que es lo correcto cuando al lado hay texto que ya dice lo
 * mismo. Con `label` se anuncia como imagen: sólo cuando el ícono ES la
 * información y no hay texto que lo acompañe.
 */
export function Icon({
  name,
  className = "h-4 w-4",
  label,
}: {
  name: IconName;
  className?: string;
  /** Texto para lectores de pantalla. Omitirlo marca el ícono como decorativo. */
  label?: string;
}) {
  const decorative = label === undefined;
  const stroke = STROKE_ICONS.has(name);

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={stroke ? "none" : "currentColor"}
      fillRule={stroke ? undefined : "evenodd"}
      stroke={stroke ? "currentColor" : undefined}
      strokeWidth={stroke ? 2 : undefined}
      strokeLinecap={stroke ? "round" : undefined}
      strokeLinejoin={stroke ? "round" : undefined}
      data-icon={name}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={label}
    >
      {PATHS[name]}
    </svg>
  );
}
