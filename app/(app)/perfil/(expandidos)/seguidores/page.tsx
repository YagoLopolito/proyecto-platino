import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/EmptyState";
import { ProfileSubpage } from "@/components/profile/ProfileSubpage";
import { PeopleList } from "@/components/profile/PeopleList";
import { getFollowers } from "@/lib/profile/overview";

export const metadata = { title: "Seguidores" };

/** Quién te sigue (issue #196). */
export default async function SeguidoresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const people = await getFollowers(supabase, user.id);

  return (
    <ProfileSubpage
      title="Seguidores"
      subtitle={people.length === 1 ? "1 persona" : `${people.length} personas`}
    >
      {people.length === 0 ? (
        <EmptyState icon="users" title="Todavía nadie te sigue." />
      ) : (
        <PeopleList people={people} label="Gente que te sigue" />
      )}
    </ProfileSubpage>
  );
}
