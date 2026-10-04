import { getOtherProfileContext } from "@/lib/profile/other";
import { ProfilePostsGrid } from "@/components/posts/ProfilePostsGrid";

/** Perfil › Galería de otro usuario: sus publicaciones (todas, la galería es pública con sesión). */
export default async function PerfilAjenoGaleriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { supabase, viewerId, name } = await getOtherProfileContext(id);
  return (
    <ProfilePostsGrid
      supabase={supabase}
      viewerId={viewerId}
      userId={id}
      basePath={`/perfil/${id}/galeria`}
      rawPage={(await searchParams).page}
      isOwn={false}
      name={name}
    />
  );
}
