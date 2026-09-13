import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFriendsDiaryFeed } from "@/lib/friends/queries";
import { FriendsDiaryFeed } from "@/components/friends/FriendsDiaryFeed";
import AddFriendModal from "@/components/friends/AddFriendModal";
import { ErrorState } from "@/components/ErrorState";
import { FriendsStrip } from "@/components/profile/FriendsStrip";

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

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-6 text-zinc-50 sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold sm:text-2xl">Actividad de tus amigos</h1>
            <p className="text-sm text-zinc-400">
              Todo lo que terminaron los usuarios que agregaste, con sus reseñas.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center">
            <Link
              href="/diario"
              className="block rounded border border-zinc-700 px-3 py-2 text-center text-sm text-zinc-300 hover:border-zinc-500 sm:py-1.5"
            >
              ← Volver al diario
            </Link>
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
          <FriendsDiaryFeed friends={outcome.friends} entries={outcome.entries} />
        )}
      </div>
    </div>
  );
}
