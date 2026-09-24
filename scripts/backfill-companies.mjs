/**
 * Backfill de estudios de IGDB para los juegos que ya estaban en la base antes
 * del issue #193 (los nuevos se completan solos al abrir su ficha).
 *
 * No reimplementa nada: llama por tandas a `/api/cron/sync?paso=estudios`,
 * que usa el mismo `lib/igdb/` + `lib/studios/` que la ficha, con la
 * concurrencia y las pausas que respetan los 4 req/s de IGDB.
 *
 *   BASE_URL=https://<deploy> CRON_SECRET=... node scripts/backfill-companies.mjs
 *
 * Corta cuando no quedan juegos pendientes, o cuando una tanda entera falla
 * (credenciales de IGDB, red): esos juegos no se marcan y se reintentan en la
 * próxima corrida.
 */
const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Falta CRON_SECRET.");
  process.exit(1);
}

const BATCH = 40;

for (;;) {
  const response = await fetch(`${baseUrl}/api/cron/sync?paso=estudios&tanda=${BATCH}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!response.ok) {
    console.error(`El endpoint respondió ${response.status}: ${await response.text()}`);
    process.exit(1);
  }
  const { companies } = await response.json();
  console.log(
    `procesados ${companies.processed}, fallidos ${companies.failed}, pendientes ${companies.pending}`,
  );
  if (companies.pending === 0) break;
  if (companies.processed === 0) {
    console.error("Una tanda entera falló: revisá las credenciales de IGDB y los logs [igdb].");
    process.exit(1);
  }
}
console.log("Listo.");
