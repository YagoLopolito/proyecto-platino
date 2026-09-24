import { ListRow } from "@/components/lists/ListRow";
import { NewListButton } from "@/components/lists/NewListButton";
import { EmptyState } from "@/components/EmptyState";
import type { ListRowData } from "@/lib/lists/queries";

/**
 * Perfil › Listas (epic #183, issue #197), propio y ajeno: las listas como
 * filas con la tira de pósters (`ListRow`), igual que Biblioteca › Listas. En
 * el propio van también las privadas, con candado, y el "+" para crear.
 */
export function ProfileLists({
  title,
  lists,
  canCreate,
}: {
  title: string;
  lists: ListRowData[];
  canCreate: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-6 text-ink sm:py-12">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="type-title text-ink">{title}</h1>
            <p className="type-meta text-ink-muted">
              {lists.length === 1 ? "1 lista" : `${lists.length} listas`}
            </p>
          </div>
          {canCreate && <NewListButton />}
        </div>

        {lists.length === 0 ? (
          <EmptyState
            icon="list"
            title="Todavía no hay listas."
            description={
              canCreate
                ? "Tus favoritos de una saga, los platinos más difíciles, lo que recomendarías a alguien que arranca: numeradas o no, públicas o privadas."
                : undefined
            }
          />
        ) : (
          <ul aria-label={title} className="divide-y divide-border">
            {lists.map((list) => (
              <li key={list.href} data-testid="profile-list">
                <ListRow list={list} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
