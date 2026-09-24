import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { countPlayed } from "@/lib/lists/queries";
import { getSystemList } from "@/lib/lists/system";
import { ListGames, ListProgress, parseListView } from "@/components/lists/ListGames";

export const metadata = { title: "Lista" };

/**
 * Ficha de una lista pregenerada (epic #183, issue #192): la misma UI que la
 * de una lista de usuario (#189), sin editar ni likes. La arma Platinoob con
 * datos, así que el autor es la marca y la descripción explica de dónde sale.
 *
 * 404 si el slug no es de ninguna lista o si no llega al mínimo de juegos:
 * la tab no la muestra, y un link viejo tampoco tiene que abrir una lista de
 * dos juegos.
 */
export default async function SystemListPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const [{ slug }, { vista }] = await Promise.all([params, searchParams]);
  const view = parseListView(vista);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const list = await getSystemList(supabase, user.id, slug);
  if (!list) notFound();

  const total = list.items.length;
  const played = await countPlayed(
    supabase,
    user.id,
    list.items.map((item) => item.gameId),
  );

  return (
    // max-w-5xl: es un listado, mismo ancho que la biblioteca.
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="space-y-4">
          <p className="inline-flex items-center gap-2 type-meta text-ink-muted">
            <Image
              src="/icon-192.png"
              alt=""
              width={28}
              height={28}
              unoptimized
              className="h-7 w-7 rounded-full"
            />
            <span>Lista de Platinoob</span>
          </p>
          <h1 className="type-display text-ink">{list.meta.title}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-overline text-ink-faint">
            <span>{total === 1 ? "1 juego" : `${total} juegos`}</span>
            <span aria-hidden="true">·</span>
            <span>{list.meta.personal ? "Armada para vos" : "Se actualiza todos los días"}</span>
          </p>
          <p className="max-w-3xl type-review text-ink-muted">{list.meta.description}</p>
        </header>

        <ListProgress played={played} total={total} />

        <ListGames
          items={list.items}
          isRanked={list.meta.isRanked}
          view={view}
          href={`/listas/sistema/${list.meta.slug}`}
        />
      </div>
    </div>
  );
}
