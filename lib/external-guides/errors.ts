import "server-only";

/**
 * Falló la llamada a una fuente externa (Steam Web API), no bloquea a las demás.
 * El mensaje llega a la pantalla, así que no incluye el de `cause` (una URL,
 * un status HTTP o un error de red, #165): ese queda en `cause` para el log.
 */
export class ExternalGuideSourceError extends Error {
  constructor(source: string, cause?: unknown) {
    super(`No se pudo consultar la fuente "${source}" para enlaces externos.`);
    this.name = "ExternalGuideSourceError";
    this.cause = cause;
  }
}
