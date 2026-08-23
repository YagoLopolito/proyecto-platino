import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FindExternalGuidesButton from "./FindExternalGuidesButton";
import GameBreadcrumb from "@/components/GameBreadcrumb";

/**
 * El botón "Buscar guías externas" invoca findExternalGuides (actions.ts),
 * que llama a la Steam Web API (dos consultas) -- puede pasar el timeout
 * default de una función de Vercel. maxDuration para un Server Action va en
 * la página que lo invoca, no en el archivo "use server".
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

  const { data: curatedGuides, error: linksError } = await supabase
    .from("game_external_guides")
    .select("id, title, url, source")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });

  const links: ExternalLink[] = curatedGuides ?? [];

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-8 sm:py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <GameBreadcrumb gameId={gameId} gameName={game.name} current="Guías y enlaces" />

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Guías de trofeos de {game.name}</h1>
          <p className="text-sm text-zinc-400">
            Guías de trofeos y logros de fuentes externas (Steam Community, PowerPyx,
            PSNProfiles, TrueTrophies, YouTube). Cada enlace cita su fuente y abre en el sitio
            original.
          </p>
        </div>

        <FindExternalGuidesButton gameId={gameId} gameName={game.name} />

        <section className="space-y-3">
          {linksError && (
            <p role="alert" className="text-sm text-red-400">
              No se pudieron cargar los enlaces: {linksError.message}
            </p>
          )}

          {!linksError && links.length === 0 && (
            <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
              Todavía no hay guías externas para este juego. Probá &ldquo;Buscar guías de
              trofeos&rdquo; arriba.
            </p>
          )}

          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block space-y-1 rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-blue-500"
            >
              <h2 className="font-semibold text-zinc-100">{link.title}</h2>
              {link.source && <p className="text-xs text-zinc-500">Fuente: {link.source}</p>}
              <p className="truncate text-xs text-blue-400">{link.url}</p>
            </a>
          ))}
        </section>

        <div className="flex items-center justify-end">
          <Link href={`/juegos/${gameId}`} className="text-sm text-blue-400 hover:underline">
            Ver juego →
          </Link>
        </div>
      </div>
    </div>
  );
}
