import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { ACTIVITY_FILTERS, type ActivityTab } from "@/lib/activity/format";

/**
 * Filtro por tipo de evento, en `?tipo=`. Son links y no estado de React
 * (misma regla que `?fuente=` de la biblioteca): linkeable, sobrevive al
 * refresh y el filtro se aplica en el RPC, no escondiendo filas.
 */
export function ActivityFilter({
  tab,
  basePath,
  active,
}: {
  tab: ActivityTab;
  basePath: string;
  active: string | null;
}) {
  const filters = ACTIVITY_FILTERS[tab];
  if (filters.length === 0) return null;
  const options = [{ value: null, label: "Todo" }, ...filters];

  return (
    <nav aria-label="Filtrar por tipo" className="flex items-center gap-2">
      <Icon name="filters" className="h-4 w-4 shrink-0 text-ink-muted" />
      <ul className="flex gap-1.5 overflow-x-auto">
        {options.map((option) => {
          const current = option.value === active;
          return (
            <li key={option.value ?? "todo"}>
              <Link
                href={option.value ? `${basePath}?tipo=${option.value}` : basePath}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-9 items-center whitespace-nowrap rounded-chip border px-3 type-caption font-medium transition-colors ${
                  current
                    ? "border-accent-ink bg-accent/15 text-accent-ink"
                    : "border-border-strong bg-surface text-ink-muted hover:text-ink"
                }`}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
