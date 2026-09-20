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
  "search",
  "arrow-down",
  "close",
  "chevron-down",
  "filters",
  "check",
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
  "filters",
  "check",
  "arrow-down",
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
  /** Desplegable: `<select>`, disclosure de filtros. */
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  /** Abre los filtros plegados en mobile. */
  filters: <path d="M4 6h16M7 12h10M10 18h4" />,
  /** Opción activada de un `ToggleChip`. */
  check: <path d="m5 13 4 4L19 7" />,
  /** Dirección del orden de un listado: apunta abajo, rota 180° para "asc". */
  "arrow-down": <path d="M12 5v14M6 13l6 6 6-6" />,
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
