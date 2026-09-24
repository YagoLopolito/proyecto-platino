import { ActivityScreen } from "@/components/activity/ActivityScreen";

export const metadata = { title: "Recibido" };

/** Actividad › Recibido (epic #183, issue #195). */
export default async function ActividadRecibidoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  return <ActivityScreen tab="recibido" tipo={tipo} />;
}
