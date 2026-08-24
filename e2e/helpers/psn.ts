import { createCipheriv, randomBytes } from "node:crypto";

/**
 * Reimplementación mínima de `lib/psn/crypto.ts#encryptSecret`, usada solo
 * para seedear filas de `psn_accounts` directo en la base en los specs que
 * necesitan un NPSSO "vencido" que ya estaba conectado (SYNC-03) -- no se
 * puede llegar a ese estado por UI porque `connectPsnAccount` rechaza un
 * NPSSO vencido antes de guardar nada.
 *
 * No se importa `lib/psn/crypto.ts` directo porque arranca con
 * `import "server-only"`, que en Node plano (fuera de un bundle de Next.js)
 * tira una excepción al importarse -- por eso el algoritmo está duplicado acá
 * en vez de reusado. Tiene que coincidir exactamente con `decryptSecret` para
 * que `syncTrophiesForUser` pueda descifrarlo.
 */
export function encryptNpssoForFixture(plaintext: string): string {
  const raw = process.env.PSN_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Falta PSN_TOKEN_ENCRYPTION_KEY en el entorno de test (.env.test.local o .env.local).",
    );
  }
  const key = Buffer.from(raw, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ".",
  );
}
