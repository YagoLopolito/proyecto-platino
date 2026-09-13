import Link from "next/link";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { SectionHeader, SectionAction } from "@/components/ui/SectionHeader";
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
          <Link href="/diario/amigos">
            <SectionAction>Ver actividad</SectionAction>
          </Link>
        }
      />
      {friends.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          Todavía no agregaste amigos. Se agregan desde el diario, y desde acá vas a poder ver su
          perfil.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {friends.map((friend) => {
            const label = profileLabel(friend);
            return (
              <li key={friend.id}>
                <Link
                  href={`/perfil/${friend.id}`}
                  data-testid="friend-link"
                  className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 py-1 pl-1 pr-3 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
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
