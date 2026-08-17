import "server-only";

/** Falló la llamada a una fuente externa (Steam Web API, búsqueda con IA), no bloquea a las demás. */
export class ExternalGuideSourceError extends Error {
  constructor(source: string, cause?: unknown) {
    super(`No se pudo consultar la fuente "${source}" para enlaces externos.`);
    this.name = "ExternalGuideSourceError";
    this.cause = cause;
  }
}
