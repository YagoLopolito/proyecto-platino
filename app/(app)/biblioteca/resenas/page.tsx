import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFriendsDiaryFeed } from "@/lib/friends/queries";
import { getReviewLikes } from "@/lib/likes/queries";
import { FriendsDiaryFeed } from "@/components/friends/FriendsDiaryFeed";
import AddFriendModal from "@/components/friends/AddFriendModal";
import { ErrorState } from "@/components/ErrorState";
import { FriendsStrip } from "@/components/profile/FriendsStrip";
import { BackToDiaryLink } from "@/components/diary/BackToDiaryLink";

/**
 * Actividad completa de los amigos, con reseñas. En `/diario` solo entra un
 * feed corto de carátulas para no empujar el diario propio fuera de pantalla.
 */
export default async function FriendsActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const outcome = await getFriendsDiaryFeed(supabase, user.id);
  const likes =
    outcome.status === "ok"
      ? await getReviewLikes(
          supabase,
          user.id,
          outcome.entries.map((entry) => entry.id),
        )
      : new Map();

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="type-title text-ink">Actividad de tus amigos</h1>
            <p className="type-body text-ink-muted">
              Todo lo que terminaron los usuarios que agregaste, con sus reseñas.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center">
            <BackToDiaryLink />
            <AddFriendModal />
          </div>
        </div>

        {/* Los avatares llevan al perfil de cada amigo: el feed de abajo
            linkea al juego, así que sin esto no había forma de llegar a la
            persona. */}
        {outcome.status === "ok" && <FriendsStrip friends={outcome.friends} />}

        {outcome.status === "error" ? (
          <ErrorState message={`No se pudo cargar la actividad: ${outcome.message}`} />
        ) : (
          <FriendsDiaryFeed friends={outcome.friends} entries={outcome.entries} likes={likes} />
        )}
      </div>
    </div>
  );
}
