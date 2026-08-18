import Link from "next/link";

/**
 * Breadcrumb consistente para las rutas anidadas de un juego:
 * "Biblioteca > [Nombre del juego] > [sección actual]". `current` se omite
 * cuando estamos en la propia página de detalle del juego (ahí el nombre del
 * juego ya es el último tramo, sin sección extra).
 */
export default function GameBreadcrumb({
  gameId,
  gameName,
  current,
}: {
  gameId: string;
  gameName: string;
  current?: string;
}) {
  return (
    <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-zinc-400">
      <Link href="/juegos" className="hover:text-accent hover:underline">
        Biblioteca
      </Link>
      <span aria-hidden="true">/</span>
      {current ? (
        <Link href={`/juegos/${gameId}`} className="hover:text-accent hover:underline">
          {gameName}
        </Link>
      ) : (
        <span className="text-zinc-100">{gameName}</span>
      )}
      {current && (
        <>
          <span aria-hidden="true">/</span>
          <span className="text-zinc-100">{current}</span>
        </>
      )}
    </nav>
  );
}
