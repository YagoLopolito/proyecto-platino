import { ActivityScreen } from "@/components/activity/ActivityScreen";

export const metadata = { title: "Tu actividad" };

/** Actividad › Tu actividad (epic #183, issue #195). */
export default async function ActividadVosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  return <ActivityScreen tab="vos" tipo={tipo} />;
}
