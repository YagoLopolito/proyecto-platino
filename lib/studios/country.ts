/**
 * IGDB publica el país de un estudio como ISO 3166-1 **numérico** (840, 392…),
 * y `Intl.DisplayNames` sólo entiende alfa-2. Esta tabla cubre los países con
 * estudios en la práctica; uno que no esté simplemente no se muestra.
 *
 * Módulo puro, sin `server-only`: se testea desde el spec.
 */
const NUMERIC_TO_ALPHA2: Record<number, string> = {
  32: "AR", 36: "AU", 40: "AT", 56: "BE", 76: "BR", 124: "CA", 152: "CL", 156: "CN",
  158: "TW", 170: "CO", 203: "CZ", 208: "DK", 246: "FI", 250: "FR", 276: "DE",
  344: "HK", 348: "HU", 356: "IN", 372: "IE", 376: "IL", 380: "IT", 392: "JP",
  410: "KR", 484: "MX", 528: "NL", 554: "NZ", 578: "NO", 604: "PE", 616: "PL",
  620: "PT", 642: "RO", 643: "RU", 702: "SG", 703: "SK", 724: "ES", 752: "SE",
  756: "CH", 792: "TR", 804: "UA", 826: "GB", 840: "US", 858: "UY",
};

export function countryName(numericCode: number | null): string | null {
  if (numericCode === null) return null;
  const alpha2 = NUMERIC_TO_ALPHA2[numericCode];
  if (!alpha2) return null;
  try {
    return new Intl.DisplayNames(["es"], { type: "region" }).of(alpha2) ?? null;
  } catch {
    return null;
  }
}
