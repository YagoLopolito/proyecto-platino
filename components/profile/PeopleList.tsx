import Link from "next/link";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { profileLabel } from "@/lib/friends/constants";
import type { FriendProfile } from "@/lib/friends/queries";

/**
 * Lista de usuarios (Siguiendo / Seguidores, issue #196): filas con hairline,
 * avatar y nombre, cada una un link a su perfil.
 */
export function PeopleList({ people, label }: { people: FriendProfile[]; label: string }) {
  const sorted = [...people].sort((a, b) => profileLabel(a).localeCompare(profileLabel(b), "es"));
  return (
    <ul aria-label={label} className="max-w-2xl divide-y divide-border border-y border-border">
      {sorted.map((person) => (
        <li key={person.id} data-testid="profile-person">
          <Link
            href={`/perfil/${person.id}`}
            className="flex min-h-11 items-center gap-3 px-1 py-2.5 type-body text-ink transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          >
            <FriendAvatar url={person.avatarUrl} name={profileLabel(person)} size={36} />
            {profileLabel(person)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
