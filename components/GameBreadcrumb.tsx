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
    <nav
      aria-label="breadcrumb"
      className="flex flex-wrap items-center gap-1 type-meta text-ink-muted"
    >
      <Link href="/juegos" className="transition-colors hover:text-accent-ink hover:underline">
        Biblioteca
      </Link>
      <span aria-hidden="true">/</span>
      {current ? (
        <Link
          href={`/juegos/${gameId}`}
          className="transition-colors hover:text-accent-ink hover:underline"
        >
          {gameName}
        </Link>
      ) : (
        <span className="text-ink">{gameName}</span>
      )}
      {current && (
        <>
          <span aria-hidden="true">/</span>
          <span className="text-ink">{current}</span>
        </>
      )}
    </nav>
  );
}
