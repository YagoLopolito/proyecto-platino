/** El NPSSO guardado ya no es válido y el usuario debe pegar uno nuevo. */
export class NpssoExpiredError extends Error {
  constructor(cause?: unknown) {
    super("El NPSSO expiró o es inválido. Es necesario reconectar la cuenta PSN.");
    this.name = "NpssoExpiredError";
    this.cause = cause;
  }
}
