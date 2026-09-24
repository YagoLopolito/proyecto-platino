import type { ReactNode } from "react";
import Link from "next/link";
import { GameArt } from "@/components/game/GameArt";
import { ErrorState } from "@/components/ErrorState";
import { SwipeTabs } from "@/components/ui/SwipeTabs";
import { getStudioPage } from "@/lib/studios/page-data";

const DESCRIPTION_PREVIEW_CHARS = 400;

/**
 * Perfil de un estudio (epic #183, issue #193): desarrolladoras y publishers
 * de IGDB, con lo que hicieron. Cabecera fija y dos tabs por ruta
 * (Desarrollados / Publicados), mismo patrón que la ficha de juego.
 */
export default async function StudioLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { profile } = await getStudioPage(slug);

  if (profile === "unavailable") {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-12">
        <ErrorState message="No pudimos cargar este estudio. Probá de nuevo en un rato." />
      </div>
    );
  }

  const base = `/estudios/${encodeURIComponent(profile.slug)}`;
  const description = profile.description?.trim() || null;
  // Sin logo, las iniciales: un cuadrado vacío no dice de quién es la página.
  const initials = profile.name
    .replace(/\[.*?\]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  const initialsNode = (
    <span aria-hidden="true" className="type-title text-ink-muted">
      {initials}
    </span>
  );

  return (
    // max-w-5xl: es un listado, mismo ancho que la biblioteca.
    <div className="flex flex-1 flex-col bg-background text-ink">
      <header className="mx-auto w-full max-w-5xl space-y-4 px-4 pb-2 pt-6 sm:pt-12">
        <div className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border-strong bg-surface sm:h-20 sm:w-20">
            {profile.logoUrl ? (
              <GameArt
                src={profile.logoUrl}
                alt=""
                sizes="80px"
                className="object-contain p-2"
                fallback={initialsNode}
              />
            ) : (
              initialsNode
            )}
          </div>
          <div className="min-w-0 space-y-1">
            {/* El nombre es el texto editorial de la pantalla: la serif. */}
            <h1 className="break-words type-display text-ink">{profile.name}</h1>
            {(profile.country || profile.parent) && (
              <p className="flex flex-wrap items-center gap-x-2 type-overline text-ink-faint">
                {profile.country && <span>{profile.country}</span>}
                {profile.country && profile.parent && <span aria-hidden="true">·</span>}
                {profile.parent && (
                  <span>
                    Parte de{" "}
                    <Link
                      href={`/estudios/${encodeURIComponent(profile.parent.slug)}`}
                      className="text-accent-ink hover:underline"
                    >
                      {profile.parent.name}
                    </Link>
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        {description &&
          (description.length > DESCRIPTION_PREVIEW_CHARS ? (
            <details className="group max-w-3xl">
              <summary className="cursor-pointer list-none type-body text-ink-muted">
                <span className="group-open:hidden">
                  {description.slice(0, DESCRIPTION_PREVIEW_CHARS).trimEnd()}…{" "}
                  <span className="text-accent-ink">Ver más</span>
                </span>
                <span className="hidden text-accent-ink group-open:inline">Ver menos</span>
              </summary>
              <p className="mt-2 type-body text-ink-muted">{description}</p>
            </details>
          ) : (
            <p className="max-w-3xl type-body text-ink-muted">{description}</p>
          ))}
      </header>

      <div className="mt-4">
        <SwipeTabs
          tabs={[
            { href: base, label: `Desarrollados (${profile.developed.length})` },
            { href: `${base}/publicados`, label: `Publicados (${profile.published.length})` },
          ]}
          label="Juegos del estudio"
        >
          {children}
        </SwipeTabs>
      </div>
    </div>
  );
}
