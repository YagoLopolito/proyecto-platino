import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfilePostsGrid } from "@/components/posts/ProfilePostsGrid";

export const metadata = { title: "Tu galería" };

/** Perfil › Galería: tus publicaciones de la Galería online. */
export default async function PerfilGaleriaPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <ProfilePostsGrid
      supabase={supabase}
      viewerId={user.id}
      userId={user.id}
      basePath="/perfil/galeria"
      rawPage={(await searchParams).page}
      isOwn
      name="Vos"
    />
  );
}
