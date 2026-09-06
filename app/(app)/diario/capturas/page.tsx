import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScreenshotImporter from "@/components/diary/ScreenshotImporter";
import { ErrorState } from "@/components/ErrorState";

export const metadata = { title: "Importar capturas" };

/**
 * Importador masivo de capturas. Sony no expone la galería de PSN por ninguna
 * API usable (ver `CLAUDE.md`), así que las capturas siguen llegando desde el
 * archivo del usuario -- pero acá entra la carpeta entera que exportó de la
 * consola de una sola vez, y cada archivo se asigna solo al juego que dice su
 * ruta (`lib/diary/screenshot-import.ts`).
 */
export default async function ImportScreenshotsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Todos los juegos vinculados al usuario, incluidos los de catálogo: el
  // diario los usa igual y una captura puede ser de cualquiera de ellos.
  const { data, error } = await supabase
    .from("user_games")
    .select("games!inner (id, name, cover_url, icon_url)")
    .order("last_played_at", { ascending: false, nullsFirst: false });

  const games = (data ?? [])
    .flatMap((row) => (Array.isArray(row.games) ? row.games : [row.games]))
    .filter((game): game is NonNullable<typeof game> => !!game)
    .map((game) => ({
      id: game.id as string,
      name: game.name as string,
      coverUrl: (game.cover_url ?? game.icon_url ?? null) as string | null,
    }));

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-6 text-zinc-50 sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold sm:text-2xl">Importar capturas</h1>
            <p className="text-sm text-zinc-400">
              Soltá acá la carpeta de capturas que exportaste de la PlayStation: cada foto se asigna
              sola al juego que dice su carpeta o su nombre de archivo.
            </p>
          </div>
          <Link
            href="/diario"
            className="block rounded border border-zinc-700 px-3 py-2 text-center text-sm text-zinc-300 hover:border-zinc-500 sm:py-1.5"
          >
            ← Volver al diario
          </Link>
        </div>

        {error ? (
          <ErrorState message={`No se pudo cargar tu biblioteca: ${error.message}`} />
        ) : (
          <ScreenshotImporter games={games} />
        )}
      </div>
    </div>
  );
}
