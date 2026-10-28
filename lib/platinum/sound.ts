/**
 * Sonido de platino. Sólo cliente.
 *
 * El navegador bloquea el audio sin una interacción previa del usuario
 * (autoplay): `playPlatinumSound` nunca tira, devuelve si sonó o no, y el
 * caller decide si ofrece el botón para reproducirlo a mano.
 */
import { PLATINUM_SOUND_SRC, warnMissingPlatinumAsset } from "./assets";

export type SoundOutcome = "played" | "blocked" | "missing";

let missing = false;

export async function playPlatinumSound(volume: number): Promise<SoundOutcome> {
  if (missing || typeof Audio === "undefined") return "missing";
  const audio = new Audio(PLATINUM_SOUND_SRC);
  audio.volume = Math.min(1, Math.max(0, volume));

  const failedToLoad = new Promise<SoundOutcome>((resolve) => {
    audio.addEventListener(
      "error",
      () => {
        missing = true;
        warnMissingPlatinumAsset(PLATINUM_SOUND_SRC);
        resolve("missing");
      },
      { once: true },
    );
  });

  try {
    return await Promise.race([audio.play().then((): SoundOutcome => "played"), failedToLoad]);
  } catch (cause) {
    // `NotAllowedError` es el autoplay bloqueado; cualquier otra cosa (un
    // formato que el navegador no decodifica, un 404) es que no hay sonido.
    if (cause instanceof DOMException && cause.name === "NotAllowedError") return "blocked";
    return "missing";
  }
}
