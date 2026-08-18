import "server-only";

/** El modelo devolvió algo que no matchea el schema esperado, ni siquiera tras un reintento. */
export class AiSchemaValidationError extends Error {
  constructor(cause?: unknown) {
    super("La IA devolvió una respuesta con un formato inválido.");
    this.name = "AiSchemaValidationError";
    this.cause = cause;
  }
}

/** Falló la llamada al proveedor de IA (red, rate limit, API key, etc.), no un problema de schema. */
export class AiProviderError extends Error {
  constructor(cause?: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : cause ? String(cause) : undefined;
    super(
      causeMessage
        ? `No se pudo generar el plan: falló la llamada al proveedor de IA (${causeMessage}).`
        : "No se pudo generar el plan: falló la llamada al proveedor de IA.",
    );
    this.name = "AiProviderError";
    this.cause = cause;
  }
}
