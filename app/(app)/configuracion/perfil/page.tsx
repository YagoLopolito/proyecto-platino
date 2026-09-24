import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBio } from "@/lib/profile/overview";
import { BioForm } from "./BioForm";

export const metadata = { title: "Perfil · Configuración" };

/** Configuración › Perfil (issue #196): lo que se muestra debajo del avatar. */
export default async function ConfiguracionPerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const bio = await getOwnBio(supabase, user.id);

  return (
    <section className="space-y-3">
      <p className="type-meta text-ink-muted">
        Una línea que se muestra debajo de tu avatar, en tu perfil y en el que ven los demás.
      </p>
      <BioForm initialBio={bio} />
    </section>
  );
}
