import { NewPostScreen } from "@/components/posts/NewPostScreen";

export const metadata = { title: "Nueva publicación" };

/**
 * Nueva publicación de la Galería online, como página: es lo que se ve al
 * entrar por URL o recargar, y en mobile. Desde la app, en escritorio, el
 * mismo link se abre en un modal (`@modal/(.)publicaciones/nueva`).
 */
export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ juego?: string }>;
}) {
  const { juego } = await searchParams;
  return (
    // `max-w-5xl`: dos columnas en escritorio (archivos | datos).
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:py-10">
      <h1 className="type-title text-ink">Nueva publicación</h1>
      <NewPostScreen gameId={juego} />
    </div>
  );
}
