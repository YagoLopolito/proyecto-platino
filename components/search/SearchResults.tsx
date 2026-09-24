import type { ReactNode } from "react";
import Image from "next/image";
import { EmptyState } from "@/components/EmptyState";
import { FriendAvatar } from "@/components/friends/FriendAvatar";
import { GameArt } from "@/components/game/GameArt";
import { ListRow } from "@/components/lists/ListRow";
import { FollowButton } from "@/components/search/FollowButton";
import { profileLabel } from "@/lib/friends/constants";
import type { UserSearchResult } from "@/lib/friends/actions";
import type { ListRowData } from "@/lib/lists/queries";
import type { GameHit, StudioHit } from "@/lib/search/queries";
import { saveAndGoHref, type SearchScope } from "@/lib/search/scopes";

/**
 * Filas de resultados de `/buscar` (issue #194). Cada una linkea a
 * `/buscar/ir?to=…`, que guarda la búsqueda en recientes antes de abrir el
 * resultado. Son `<a>` y no `<Link>`: el route handler escribe, y un
 * prefetch guardaría búsquedas que nadie abrió.
 */

const ROW =
  "flex min-h-16 items-center gap-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink rounded-card";

function Rows({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="divide-y divide-border">
      {children}
    </ul>
  );
}

export function GameResults({
  hits,
  query,
  scope,
}: {
  hits: GameHit[];
  query: string;
  scope: SearchScope;
}) {
  if (hits.length === 0) return <NoResults query={query} />;
  return (
    <Rows label="Juegos">
      {hits.map((hit) => (
        <li key={hit.key}>
          <a href={saveAndGoHref(query, scope, hit.href)} className={`${ROW} group`}>
            <span className="relative aspect-[3/4] w-11 shrink-0 overflow-hidden rounded-card bg-surface-raised">
              {hit.coverUrl && (
                <GameArt
                  src={hit.coverUrl}
                  alt=""
                  sizes="44px"
                  className="object-cover"
                  fallback={null}
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate type-subtitle text-ink group-hover:text-accent-ink">
                {hit.name}
                {hit.releaseYear && (
                  <span className="ml-2 type-meta text-ink-muted">{hit.releaseYear}</span>
                )}
              </span>
              {hit.platform && (
                <span className="block truncate type-caption text-ink-muted">{hit.platform}</span>
              )}
            </span>
            {hit.inLibrary && (
              <span className="shrink-0 rounded-chip bg-surface-hover px-2 py-0.5 type-caption text-ink-muted">
                En tu biblioteca
              </span>
            )}
          </a>
        </li>
      ))}
    </Rows>
  );
}

export function StudioResults({
  hits,
  query,
  scope,
  igdbUnavailable,
}: {
  hits: StudioHit[];
  query: string;
  scope: SearchScope;
  igdbUnavailable: boolean;
}) {
  return (
    <div className="space-y-3">
      {igdbUnavailable && (
        <p role="status" className="type-caption text-ink-muted">
          No pudimos consultar IGDB: se muestran sólo los estudios que ya conocemos.
        </p>
      )}
      {hits.length === 0 ? (
        <NoResults query={query} />
      ) : (
        <Rows label="Estudios">
          {hits.map((hit) => (
            <li key={hit.slug}>
              <a
                href={saveAndGoHref(query, scope, `/estudios/${hit.slug}`)}
                className={`${ROW} group`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-card bg-surface-raised type-meta font-medium text-ink-muted">
                  {hit.logoUrl ? (
                    <Image
                      src={hit.logoUrl}
                      alt=""
                      width={44}
                      height={44}
                      unoptimized
                      className="object-contain"
                    />
                  ) : (
                    hit.name.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate type-subtitle text-ink group-hover:text-accent-ink">
                    {hit.name}
                  </span>
                  {hit.gameCount !== null && (
                    <span className="block type-caption text-ink-muted">
                      {hit.gameCount === 1 ? "1 juego" : `${hit.gameCount} juegos`}
                    </span>
                  )}
                </span>
              </a>
            </li>
          ))}
        </Rows>
      )}
    </div>
  );
}

export function ListResults({
  lists,
  query,
  scope,
}: {
  lists: ListRowData[];
  query: string;
  scope: SearchScope;
}) {
  if (lists.length === 0) return <NoResults query={query} />;
  return (
    <Rows label="Listas">
      {lists.map((list) => (
        <li key={list.href}>
          <ListRow
            list={{ ...list, href: saveAndGoHref(query, scope, list.href) }}
            prefetch={false}
          />
        </li>
      ))}
    </Rows>
  );
}

export function UserResults({
  users,
  query,
  scope,
}: {
  users: UserSearchResult[];
  query: string;
  scope: SearchScope;
}) {
  if (users.length === 0) return <NoResults query={query} />;
  return (
    <Rows label="Usuarios">
      {users.map((user) => {
        const name = profileLabel(user);
        return (
          <li key={user.id} className="flex items-center gap-3">
            <a
              href={saveAndGoHref(query, scope, `/perfil/${user.id}`)}
              className={`${ROW} group min-w-0 flex-1`}
            >
              <FriendAvatar url={user.avatarUrl} name={name} size={44} />
              <span className="truncate type-subtitle text-ink group-hover:text-accent-ink">
                {name}
              </span>
            </a>
            <FollowButton userId={user.id} name={name} isFriend={user.isFriend} />
          </li>
        );
      })}
    </Rows>
  );
}

function NoResults({ query }: { query: string }) {
  return <EmptyState icon="search" title={`No encontramos nada para “${query}”.`} />;
}
