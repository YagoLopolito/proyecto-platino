import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileListRows } from "@/lib/lists/queries";
import { ProfileLists } from "@/components/lists/ProfileLists";

export const metadata = { title: "Mis listas" };

/**
 * Perfil › Listas (epic #183, issues #189 y #197): tus listas, públicas y
 * privadas (con candado), la última editada primero.
 */
export default async function PerfilListasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const lists = await getProfileListRows(supabase, user.id, user.id, { publicOnly: false });
  return <ProfileLists title="Mis listas" lists={lists} canCreate />;
}
