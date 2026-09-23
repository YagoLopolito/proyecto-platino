import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFriendReviewsPage } from "@/lib/friends/reviews";
import { FriendReviewFeed } from "@/components/friends/FriendReviewFeed";
import AddFriendModal from "@/components/friends/AddFriendModal";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

export const metadata = { title: "Reseñas" };

/**
 * Biblioteca › Reseñas (epic #183, issue #191): las reseñas de la gente que
 * seguís, como la tab Reviews de Letterboxd. Reemplaza a `/diario/amigos`.
 *
 * Una columna de lectura (`max-w-2xl`) también en escritorio: una reseña se
 * lee, no se escanea, y a 1024px una línea de serif es inleíble.
 */
export default async function BibliotecaResenasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const outcome = await getFriendReviewsPage(supabase, user.id);

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="type-title text-ink">Reseñas de tus amigos</h1>
            <p className="type-body text-ink-muted">
              Lo último que escribieron sobre lo que terminaron.
            </p>
          </div>
          <AddFriendModal />
        </div>

        {outcome.status === "error" ? (
          <ErrorState message={`No se pudieron cargar las reseñas: ${outcome.message}`} />
        ) : outcome.friends.length === 0 ? (
          <EmptyState
            icon="users"
            title="Todavía no seguís a nadie."
            description="Buscá a tus amigos para leer lo que opinan de lo que juegan."
            action={<AddFriendModal label="Buscar amigos" />}
          />
        ) : outcome.reviews.length === 0 ? (
          <EmptyState
            icon="book"
            title="Tus amigos todavía no escribieron ninguna reseña."
            description="Cuando registren un juego terminado con su opinión, aparece acá."
          />
        ) : (
          <FriendReviewFeed initialReviews={outcome.reviews} initialCursor={outcome.nextCursor} />
        )}
      </div>
    </div>
  );
}
