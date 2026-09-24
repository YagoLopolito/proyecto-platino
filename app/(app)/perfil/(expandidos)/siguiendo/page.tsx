import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/EmptyState";
import { ProfileSubpage } from "@/components/profile/ProfileSubpage";
import { PeopleList } from "@/components/profile/PeopleList";
import { getFriends } from "@/lib/friends/queries";

export const metadata = { title: "Siguiendo" };

/** A quién seguís (issue #196). La relación es unidireccional, sin aceptación. */
export default async function SiguiendoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const people = await getFriends(supabase, user.id);

  return (
    <ProfileSubpage
      title="Siguiendo"
      subtitle={people.length === 1 ? "1 persona" : `${people.length} personas`}
    >
      {people.length === 0 ? (
        <EmptyState icon="users" title="Todavía no seguís a nadie." />
      ) : (
        <PeopleList people={people} label="Gente que seguís" />
      )}
    </ProfileSubpage>
  );
}
