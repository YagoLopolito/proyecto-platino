"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import ImportPlatinumsButton from "@/components/diary/ImportPlatinumsButton";

const ITEM_CLASS =
  "flex min-h-11 w-full items-center gap-2 px-3 type-body text-ink transition-colors hover:bg-surface-hover focus:outline-none focus-visible:bg-surface-hover";

/**
 * Menú ⋮ del diario (epic #183, issue #197): las acciones secundarias
 * (resumen del año, importar capturas, importar platinos) salen de la cabecera
 * y dejan lugar al diario. Estado propio y no `<details>`, igual que el menú de
 * cuenta del header: tiene que cerrarse al tocar afuera y con Escape.
 */
export function DiaryActionsMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-chip text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
      >
        <Icon name="more" className="h-5 w-5" label="Más acciones del diario" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-card border border-border bg-surface-raised py-1 shadow-lg"
        >
          <Link href="/diario/resumen" role="menuitem" className={ITEM_CLASS}>
            <Icon name="chart" className="h-4 w-4 text-ink-muted" />
            Resumen del año
          </Link>
          <Link href="/diario/capturas" role="menuitem" className={ITEM_CLASS}>
            <Icon name="camera" className="h-4 w-4 text-ink-muted" />
            Importar capturas
          </Link>
          <div className="border-t border-border px-3 py-2">
            <ImportPlatinumsButton />
          </div>
        </div>
      )}
    </div>
  );
}
