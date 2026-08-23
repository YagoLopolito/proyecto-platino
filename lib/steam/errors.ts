import "server-only";

/**
 * El perfil de Steam existe pero tiene "Detalles del juego" en privado.
 *
 * Es un estado propio y NO un error de la API: la key es válida, la request
 * devuelve HTTP 200, y lo que vuelve es `{ "response": {} }`. Confundirlo con
 * "no tiene juegos" fue el modo de falla más obvio a evitar en esta capa.
 */
export class SteamProfilePrivateError extends Error {
  constructor() {
    super(
      "El perfil de Steam está en privado. Poné \"Detalles del juego\" en Público para poder sincronizar.",
    );
    this.name = "SteamProfilePrivateError";
  }
}

/** Ni el SteamID64 ni la URL personalizada resuelven a una cuenta existente. */
export class SteamProfileNotFoundError extends Error {
  constructor() {
    super("No encontramos ese perfil de Steam. Revisá el SteamID64 o la URL personalizada.");
    this.name = "SteamProfileNotFoundError";
  }
}

/** Falló la llamada a la Steam Web API (red, 5xx, key inválida, rate limit). */
export class SteamApiError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SteamApiError";
    this.cause = cause;
  }
}

/** Falta `STEAM_API_KEY` en el entorno: la app no puede hablar con Steam. */
export class SteamApiKeyMissingError extends SteamApiError {
  constructor() {
    super("Falta STEAM_API_KEY en el servidor: la conexión con Steam está deshabilitada.");
    this.name = "SteamApiKeyMissingError";
  }
}
