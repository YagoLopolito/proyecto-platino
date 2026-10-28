import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnBio } from "@/lib/profile/overview";
import { BioForm } from "./BioForm";
import { ProfilePlatformForm } from "./ProfilePlatformForm";
import { PlatinumPrefsForm } from "./PlatinumPrefsForm";
import { getPlatinumPrefs } from "@/lib/platinum/queries";

export const metadata = { title: "Perfil · Configuración" };

/** Configuración › Perfil (issue #196): lo que se muestra debajo del avatar. */
export default async function ConfiguracionPerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [bio, { data: psn }, { data: steam }, { data: profile }, platinumPrefs] = await Promise.all(
    [
      getOwnBio(supabase, user.id),
      supabase.from("psn_accounts").select("online_id").eq("user_id", user.id).maybeSingle(),
      supabase.from("steam_accounts").select("persona_name").eq("user_id", user.id).maybeSingle(),
      supabase.from("public_profiles").select("profile_platform").eq("id", user.id).maybeSingle(),
      getPlatinumPrefs(supabase, user.id),
    ],
  );

  return (
    <section className="space-y-3">
      <p className="type-meta text-ink-muted">
        Una línea que se muestra debajo de tu avatar, en tu perfil y en el que ven los demás.
      </p>
      <BioForm initialBio={bio} />
      {psn && steam && (
        <div className="space-y-3 border-t border-border pt-6">
          <p className="type-meta text-ink-muted">
            Tenés PSN y Steam conectadas: elegí con qué nombre y foto te ven los demás.
          </p>
          <ProfilePlatformForm
            current={profile?.profile_platform === "steam" ? "steam" : "psn"}
            psnName={psn.online_id ?? "PSN"}
            steamName={steam.persona_name ?? "Steam"}
          />
        </div>
      )}
      <div className="space-y-3 border-t border-border pt-6">
        <h2 id="platinum-prefs-heading" className="type-subtitle text-ink">
          Platinos
        </h2>
        <p className="type-meta text-ink-muted">
          Cómo se festeja un platino: la lluvia de trofeos, los reflejos y el sonido.
        </p>
        <PlatinumPrefsForm initial={platinumPrefs} />
      </div>
    </section>
  );
}
