import { getProfileListRows } from "@/lib/lists/queries";
import { getOtherProfileContext } from "@/lib/profile/other";
import { ProfileLists } from "@/components/lists/ProfileLists";

/** Perfil › Listas de otro usuario (#197): sólo sus listas públicas. */
export default async function PerfilAjenoListasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, viewerId, name } = await getOtherProfileContext(id);
  const lists = await getProfileListRows(supabase, viewerId, id, { publicOnly: true });
  return <ProfileLists title={`Listas de ${name}`} lists={lists} canCreate={false} />;
}
