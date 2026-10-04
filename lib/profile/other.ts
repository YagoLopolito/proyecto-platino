import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicProfile, type PublicProfile } from "@/lib/profile/queries";
import { profileLabel } from "@/lib/friends/constants";

/**
 * Contexto del perfil de otro usuario (`/perfil/[id]`, epic #183, issue #197):
 * quién mira, de quién es el perfil y su nombre. Con `cache()` de React porque
 * el layout y la tab lo piden en el mismo request.
 *
 * Sin sesión, al login; con el id propio, al perfil propio (tiene editores y
 * datos privados que acá no van); un id sin perfil, 404.
 */
export const getOtherProfileContext = cache(async function getOtherProfileContext(
  id: string,
): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  viewerId: string;
  profile: PublicProfile;
  name: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (id === user.id) redirect("/perfil");

  const profile = await getPublicProfile(supabase, id);
  if (!profile) notFound();
  return { supabase, viewerId: user.id, profile, name: profileLabel(profile) };
});

/** Las tabs del perfil ajeno: las mismas que las del propio. */
export function otherProfileTabs(id: string) {
  return [
    { href: `/perfil/${id}`, label: "Perfil" },
    { href: `/perfil/${id}/diario`, label: "Diario" },
    { href: `/perfil/${id}/listas`, label: "Listas" },
    { href: `/perfil/${id}/playlist`, label: "Playlist" },
    { href: `/perfil/${id}/galeria`, label: "Galería" },
  ];
}
