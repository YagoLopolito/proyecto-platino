import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FindExternalGuidesButton from "./FindExternalGuidesButton";
import GameBreadcrumb from "@/components/GameBreadcrumb";

/**
 * El botón "Buscar guías externas" invoca findExternalGuides (actions.ts),
 * que llama a Steam Web API + a Claude con la tool de web search -- puede
 * pasar el timeout default de una función de Vercel. maxDuration para un
 * Server Action va en la página que lo invoca, no en el archivo "use server".
 */
export const maxDuration = 60;

type ExternalLink = {
  id: string;
  title: string;
  url: string;
  source: string | null;
};

export default async function GameExternalLinksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gameId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, name")
    .eq("id", gameId)
    .single();

  if (gameError || !game) {
    notFound();
  }

  const [{ data: curatedGuides, error: curatedError }, { data: userLinks, error: userLinksError }] =
    await Promise.all([
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
    ]);

  const linksError = curatedError ?? userLinksError;

  const links: ExternalLink[] = [
    ...(curatedGuides ?? []),
    ...(userLinks ?? []).map((g) => ({
      id: g.id,
      title: g.title,
      url: g.external_url as string,
      source: g.source,
    })),
  ];

  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-8 text-ink sm:py-16">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <GameBreadcrumb gameId={gameId} gameName={game.name} current="Enlaces externos" />

        <div className="space-y-1">
          <h1 className="type-title text-ink">Enlaces externos de {game.name}</h1>
          <p className="type-body text-ink-muted">
            Guías de fuentes externas (Steam Community, PowerPyx, PSNProfiles, TrueTrophies). Cada
            enlace cita su fuente y abre en el sitio original.
          </p>
        </div>

        <FindExternalGuidesButton gameId={gameId} gameName={game.name} />

        <section className="space-y-3">
          {linksError && (
            <p role="alert" className="type-body text-danger">
              No se pudieron cargar los enlaces: {linksError.message}
            </p>
          )}

          {!linksError && links.length === 0 && (
            <p className="rounded-card border border-dashed border-border p-8 text-center type-body text-ink-muted">
              Todavía no hay enlaces externos para este juego. Probá &ldquo;Buscar guías
              externas&rdquo; arriba.
            </p>
          )}

          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block space-y-1 rounded-card border border-border bg-surface p-4 transition-colors hover:border-accent-ink"
            >
              <h2 className="type-subtitle text-ink">{link.title}</h2>
              {link.source && <p className="type-caption text-ink-faint">Fuente: {link.source}</p>}
              <p className="truncate type-caption text-accent-ink">{link.url}</p>
            </a>
          ))}
        </section>

        <div className="flex items-center justify-end">
          <Link href={`/juegos/${gameId}`} className="type-meta text-accent-ink hover:underline">
            Ver juego →
          </Link>
        </div>
      </div>
    </div>
  );
}
