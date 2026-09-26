import type { ReactNode } from "react";
import type { TrophyType } from "@/components/TrophyTypeIcon";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import ScreenshotGallery from "@/components/diary/ScreenshotGallery";
import ScreenshotUploader from "@/components/diary/ScreenshotUploader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { AiGamePlan } from "@/lib/ai";
import { getGameScreenshots } from "@/lib/diary/screenshots";
import { getGamePageBase, getGameTrophyProgress } from "@/lib/game-page/data";
import AiAdvisorPanel from "../AiAdvisorPanel";
import FindExternalGuidesButton from "../enlaces/FindExternalGuidesButton";

/**
 * El advisor (`generateAiPlan`) llama al LLM y puede reintentar una vez, y
 * "Buscar guías externas" sale a Steam: los dos pueden pasar el timeout por
 * defecto de una función de Vercel. El `maxDuration` de un Server Action va en
 * la página que lo invoca, no en el archivo "use server".
 */
export const maxDuration = 60;

/**
 * Tab Guías e IA: el advisor con IA, los enlaces a guías externas (lo que era
 * `/juegos/[id]/enlaces`) y las capturas. Todo lo que sirve para *jugar* el
 * juego, separado de lo que se *dice* de él (Reseñas) y de tu progreso
 * (Trofeos).
 */
export default async function GameGuidesTab({ params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = await params;
  const [base, progress] = await Promise.all([
    getGamePageBase(gameId),
    getGameTrophyProgress(gameId),
  ]);
  const { supabase, userId } = base;

  const [
    { data: cachedPlanRow },
    { data: curatedGuides, error: curatedError },
    { data: userLinks, error: userLinksError },
    screenshots,
  ] = await Promise.all([
    supabase
      .from("ai_game_plans")
      .select("payload_json")
      .eq("game_id", gameId)
      .eq("user_id", userId)
      .eq("status", "ok")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("game_external_guides")
      .select("id, title, url, source")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true }),
    supabase
      .from("guides")
      .select("id, title, external_url, source")
      .eq("game_id", gameId)
      .not("external_url", "is", null)
      .order("created_at", { ascending: true }),
    getGameScreenshots(supabase, gameId, userId),
  ]);

  const links = [
    ...(curatedGuides ?? []),
    ...(userLinks ?? []).map((guide) => ({
      id: guide.id,
      title: guide.title,
      url: guide.external_url as string,
      source: guide.source,
    })),
  ];
  const linksError = curatedError ?? userLinksError;
  const canUseAdvisor = base.isMember && progress.total > 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 px-4 py-6">
      <Section title="Advisor con IA">
        {canUseAdvisor ? (
          <AiAdvisorPanel
            gameId={gameId}
            trophies={progress.trophies.map((trophy) => ({
              id: trophy.id,
              name: trophy.name,
              description: trophy.description,
              type: trophy.type as TrophyType,
              obtained: trophy.obtained,
            }))}
            cachedPlan={(cachedPlanRow?.payload_json as AiGamePlan | undefined) ?? null}
          />
        ) : (
          // El plan se arma sobre los trofeos que te faltan: sin trofeos
          // sincronizados no hay nada que planificar.
          <EmptyState
            icon="sparkle"
            title="El advisor arma un plan con los trofeos que te faltan."
            description="Aparece cuando el juego está en tu biblioteca sincronizada."
          />
        )}
      </Section>

      <Section title="Guías externas">
        <p className="type-body text-ink-muted">
          Guías de Steam Community, PowerPyx, PSNProfiles y TrueTrophies. Cada enlace cita su fuente
          y abre en el sitio original.
        </p>
        <FindExternalGuidesButton gameId={gameId} />
        {linksError && (
          <ErrorState message={`No se pudieron cargar los enlaces: ${linksError.message}`} />
        )}
        {!linksError && links.length === 0 && (
          <EmptyState
            icon="link"
            title="Todavía no hay enlaces externos para este juego."
            description="Probá “Buscar guías externas”."
          />
        )}
        {links.length > 0 && (
          <ul>
            {links.map((link) => (
              <li key={link.id} className="border-t border-border first:border-t-0">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block space-y-0.5 py-3 transition-colors hover:text-accent-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
                >
                  <span className="block type-subtitle text-ink">{link.title}</span>
                  {link.source && (
                    <span className="block type-caption text-ink-faint">Fuente: {link.source}</span>
                  )}
                  <span className="block truncate type-caption text-accent-ink">{link.url}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Capturas">
        <ScreenshotUploader gameId={gameId} userId={userId} />
        {screenshots.status === "error" ? (
          <ErrorState message={`No se pudieron cargar las capturas: ${screenshots.message}`} />
        ) : (
          <ScreenshotGallery gameId={gameId} screenshots={screenshots.screenshots} />
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <SectionHeader title={title} />
      {children}
    </section>
  );
}
