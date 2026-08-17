import "server-only";

/** Falló la llamada a una fuente externa (Steam Web API, búsqueda con IA), no bloquea a las demás. */
export class ExternalGuideSourceError extends Error {
  constructor(source: string, cause?: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : null;
    super(
      `No se pudo consultar la fuente "${source}" para enlaces externos.` +
        (causeMessage ? ` (${causeMessage})` : ""),
    );
    this.name = "ExternalGuideSourceError";
    this.cause = cause;
  }
}
