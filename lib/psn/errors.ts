import "server-only";

/** El NPSSO guardado ya no sirve para autenticar contra PSN; hay que pedirle uno nuevo al usuario. */
export class NpssoExpiredError extends Error {
  constructor(cause?: unknown) {
    super("El NPSSO expiró o no es válido. Conectá la cuenta de nuevo con un NPSSO fresco.");
    this.name = "NpssoExpiredError";
    this.cause = cause;
  }
}
