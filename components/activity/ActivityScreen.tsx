import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActivityPage } from "@/lib/activity/queries";
import { activeFilter, type ActivityTab } from "@/lib/activity/format";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { ActivityFilter } from "@/components/activity/ActivityFilter";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import AddFriendModal from "@/components/friends/AddFriendModal";

const COPY: Record<
  ActivityTab,
  { path: string; label: string; emptyTitle: string; emptyDescription: string }
> = {
  amigos: {
    path: "/actividad",
    label: "Actividad de tus amigos",
    emptyTitle: "Tus amigos todavía no registraron nada.",
    emptyDescription: "Cuando la gente que seguís registre o puntúe un juego, aparece acá.",
  },
  vos: {
    path: "/actividad/vos",
    label: "Tu actividad",
    emptyTitle: "Todavía no hay nada en tu actividad.",
    emptyDescription: "Registrá un juego, sumalo a tu Playlist o armá una lista.",
  },
  recibido: {
    path: "/actividad/recibido",
    label: "Actividad recibida",
    emptyTitle: "Todavía no recibiste nada.",
    emptyDescription:
      "Cuando a alguien le guste una reseña o una lista tuya, o empiece a seguirte, lo vas a ver acá.",
  },
};

/**
 * Una tab de Actividad (epic #183, issue #195). Columna de lectura
 * (`max-w-2xl`): son frases, como las reseñas.
 */
export async function ActivityScreen({
  tab,
  tipo: rawTipo,
}: {
  tab: ActivityTab;
  tipo: string | undefined;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tipo = activeFilter(tab, rawTipo);
  const copy = COPY[tab];
  const outcome = await getActivityPage(supabase, tab, null, tipo);

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <h1 className="sr-only">{copy.label}</h1>
        <ActivityFilter tab={tab} basePath={copy.path} active={tipo} />

        {outcome.status === "error" ? (
          <ErrorState message={`No se pudo cargar la actividad: ${outcome.message}`} />
        ) : outcome.events.length === 0 ? (
          <EmptyState
            icon={tab === "amigos" ? "users" : tab === "vos" ? "bolt" : "heart"}
            title={tipo ? "No hay actividad de este tipo." : copy.emptyTitle}
            description={tipo ? undefined : copy.emptyDescription}
            action={tab === "amigos" && !tipo ? <AddFriendModal label="Buscar amigos" /> : undefined}
          />
        ) : (
          <ActivityFeed
            key={tipo ?? "todo"}
            tab={tab}
            tipo={tipo}
            initialEvents={outcome.events}
            initialCursor={outcome.nextCursor}
            label={copy.label}
          />
        )}
      </div>
    </div>
  );
}
