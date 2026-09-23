"use client";

import { usePathname, useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { PLAYLIST_SORT_LABELS, PLAYLIST_SORTS, type PlaylistSort } from "@/lib/playlist/sort";

/**
 * Orden de la Playlist. Vive en `?orden=` (linkeable, sobrevive al refresh) y
 * el orden por defecto no ensucia la URL.
 */
export function PlaylistSortSelect({ value }: { value: PlaylistSort }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="flex items-center gap-2 type-caption text-ink-muted">
      <span>Ordenar por</span>
      <Select
        value={value}
        onChange={(event) => {
          const next = event.target.value as PlaylistSort;
          router.replace(next === "recientes" ? pathname : `${pathname}?orden=${next}`, {
            scroll: false,
          });
        }}
      >
        {PLAYLIST_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {PLAYLIST_SORT_LABELS[sort]}
          </option>
        ))}
      </Select>
    </label>
  );
}
