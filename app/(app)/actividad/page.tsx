import { ActivityScreen } from "@/components/activity/ActivityScreen";

export const metadata = { title: "Actividad" };

/** Actividad › Actividad (epic #183, issue #195). */
export default async function ActividadAmigosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  return <ActivityScreen tab="amigos" tipo={tipo} />;
}
