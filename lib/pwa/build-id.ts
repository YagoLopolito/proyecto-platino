/**
 * Identidad del deploy actual.
 *
 * En Vercel es el SHA del commit que se deployó, así que cada merge de un PR
 * cambia este valor: es lo que le permite a la app instalada darse cuenta de
 * que hay una versión nueva (ver `components/pwa/PwaRuntime.tsx`).
 *
 * El mismo valor se hornea en el bundle del cliente vía `NEXT_PUBLIC_BUILD_ID`
 * (ver `next.config.ts`) y se sirve en vivo desde `/api/version`: la app
 * compara los dos.
 */
export function getBuildId(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
}
