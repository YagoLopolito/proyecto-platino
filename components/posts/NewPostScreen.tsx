import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getComposerGame, getComposerGames } from "@/lib/posts/queries";
import { PostComposer } from "./PostComposer";

/**
 * Datos del compositor (juegos para el selector y el preseleccionado de
 * `?juego=`), compartidos por la página `/publicaciones/nueva` y su versión
 * interceptada en modal.
 */
export async function NewPostScreen({ gameId }: { gameId: string | undefined }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [options, initialGame] = await Promise.all([
    getComposerGames(supabase, user.id),
    gameId ? getComposerGame(supabase, gameId) : Promise.resolve(null),
  ]);

  return <PostComposer gameOptions={options} initialGame={initialGame} />;
}
