import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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

  const { data: links, error: linksError } = await supabase
    .from("guides")
    .select("id, title, external_url, source, created_at")
    .eq("game_id", gameId)
    .not("external_url", "is", null)
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Enlaces externos de {game.name}</h1>
          <p className="text-sm text-zinc-400">
            Guías curadas por otros usuarios de fuentes externas (PowerPyx, PSNProfiles,
            TrueTrophies, IGN, YouTube y similares). Cada enlace cita su fuente y abre en el
            sitio original.
          </p>
        </div>

        <section className="space-y-3">
          {linksError && (
            <p role="alert" className="text-sm text-red-400">
              No se pudieron cargar los enlaces: {linksError.message}
            </p>
          )}

          {!linksError && (!links || links.length === 0) && (
            <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
              Todavía no hay enlaces externos para este juego. Podés agregar uno al crear una
              guía.
            </p>
          )}

          {links?.map((link) => (
            <a
              key={link.id}
              href={link.external_url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="block space-y-1 rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-blue-500"
            >
              <h2 className="font-semibold text-zinc-100">{link.title}</h2>
              {link.source && <p className="text-xs text-zinc-500">Fuente: {link.source}</p>}
              <p className="truncate text-xs text-blue-400">{link.external_url}</p>
            </a>
          ))}
        </section>

        <div className="flex items-center justify-between">
          <Link href={`/juegos/${gameId}/guias`} className="text-sm text-blue-400 hover:underline">
            ← Volver a guías
          </Link>
          <Link href={`/juegos/${gameId}`} className="text-sm text-blue-400 hover:underline">
            Ver juego →
          </Link>
        </div>
      </div>
    </div>
  );
}
