/**
 * Formateo de horas jugadas, compartido por la biblioteca y la ficha de diario.
 *
 * Vive fuera de `lib/psn/` y `lib/steam/` a propósito: las dos plataformas
 * guardan el mismo campo (`user_games.playtime_minutes`) y tienen que mostrarse
 * igual. Lo que NO son es comparables entre sí -- Steam cuenta el proceso
 * abierto y PSN cuenta sesiones de consola desde que Sony empezó a trackearlas
 * -- por eso el dato se muestra por juego y nunca sumado entre plataformas.
 */

/** `null` cuando no hay nada que mostrar: sin dato o con el contador en cero. */
export function formatPlaytime(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || minutes <= 0) return null;

  if (minutes < 60) return `${minutes} min`;

  const hours = minutes / 60;
  // Con menos de 10 horas, redondear a entero pierde demasiado (1,5 h y 1 h
  // se verían igual); a partir de ahí el decimal es ruido.
  return hours < 10
    ? `${hours.toFixed(1).replace(".", ",").replace(",0", "")} h`
    : `${Math.round(hours)} h`;
}
