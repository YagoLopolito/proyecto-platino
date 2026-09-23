import Link from "next/link";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { SectionHeader, SectionAction } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { profileLabel } from "@/lib/friends/constants";
import type { FriendProfile } from "@/lib/friends/queries";

/**
 * Fila de amigos del perfil: cada avatar entra al perfil de esa persona
 * (`/perfil/[id]`), que es donde está su Top 5 y sus últimas reseñas. Antes la
 * única forma de llegar a un amigo era su carátula en el feed del diario, que
 * lleva al juego y no a la persona.
 */
export function FriendsStrip({ friends }: { friends: FriendProfile[] }) {
  return (
    <section className="space-y-3">
      <SectionHeader
        title={`Amigos · ${friends.length}`}
        action={
          <Link href="/biblioteca/resenas">
            <SectionAction>Ver actividad</SectionAction>
          </Link>
        }
      />
      {friends.length === 0 ? (
        <EmptyState
          icon="users"
          title="Todavía no agregaste amigos."
          description="Se agregan desde el diario, y desde acá vas a poder ver su perfil."
          action={
            <Link
              href="/biblioteca/resenas"
              className="type-meta font-medium text-accent-ink hover:underline"
            >
              Buscar gente
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {friends.map((friend) => {
            const label = profileLabel(friend);
            return (
              <li key={friend.id}>
                <Link
                  href={`/perfil/${friend.id}`}
                  data-testid="friend-link"
                  className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 type-meta text-ink-muted transition-colors hover:border-border-strong hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink sm:min-h-0"
                >
                  <FriendAvatar url={friend.avatarUrl} name={label} size={28} />
                  <span className="max-w-[9rem] truncate">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
