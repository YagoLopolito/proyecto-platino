import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShowcaseView } from "@/components/platinum/ShowcaseView";
import { getNextPlatinumCandidates, getPlatinumCollection } from "@/lib/platinum/queries";
import { parseShowcaseOrder } from "@/lib/platinum/stats";

export const metadata = { title: "Vitrina" };

/** Cuántos huecos de "Tu próximo platino" se muestran como máximo. */
const NEXT_SLOTS = 3;

/**
 * Vitrina de platinos: la colección como estante de museo. Reemplaza al
 * expandido `/perfil/platinos` (que ahora redirige acá) y se llega desde el
 * contador de la biblioteca, la fila "Platinos" de Estadísticas del perfil y
 * la celebración de un platino nuevo. Cuenta como sección Perfil en la nav.
 *
 * El orden vive en `?orden=` (links, no estado: linkeable y con "atrás"), como
 * el resto de los filtros de la app.
 */
export default async function VitrinaPage({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string }>;
}) {
  const order = parseShowcaseOrder((await searchParams).orden);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [collection, { data: psnAccount }, { data: statsRows }] = await Promise.all([
    getPlatinumCollection(supabase),
    supabase
      .from("psn_accounts")
      .select(
        "trophy_level, trophy_progress, earned_platinum, earned_gold, earned_silver, earned_bronze",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.rpc("get_library_trophy_stats"),
  ]);
  const next = await getNextPlatinumCandidates(supabase, statsRows ?? [], NEXT_SLOTS);

  // Los totales que informa PSN (guardados en cada sync); los calculados con la
  // biblioteca local quedan como fallback para cuentas sin esas columnas.
  const isRealPsnData =
    psnAccount?.earned_bronze !== null && psnAccount?.earned_bronze !== undefined;
  const typeCounts = isRealPsnData
    ? {
        platinum: psnAccount.earned_platinum ?? 0,
        gold: psnAccount.earned_gold ?? 0,
        silver: psnAccount.earned_silver ?? 0,
        bronze: psnAccount.earned_bronze ?? 0,
      }
    : (statsRows ?? []).reduce(
        (acc, row) => ({
          platinum: acc.platinum + row.platinum,
          gold: acc.gold + row.gold,
          silver: acc.silver + row.silver,
          bronze: acc.bronze + row.bronze,
        }),
        { platinum: 0, gold: 0, silver: 0, bronze: 0 },
      );

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-10">
      <ShowcaseView
        order={order}
        collection={collection}
        next={next}
        psnLevel={
          psnAccount?.trophy_level != null
            ? { level: psnAccount.trophy_level, progress: psnAccount.trophy_progress ?? 0 }
            : null
        }
        typeCounts={typeCounts}
        isRealPsnData={isRealPsnData}
      />
    </div>
  );
}
