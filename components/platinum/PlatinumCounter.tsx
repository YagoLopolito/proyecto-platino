import Link from "next/link";
import { PlatinumTrophy } from "./PlatinumTrophy";

/**
 * "17 platinos" arriba de la biblioteca, con el trofeo de platino, como link a
 * la vitrina. Es el número que más dice de un cazador de trofeos, y está
 * siempre a la vista para que cada platino nuevo se note.
 */
export function PlatinumCounter({ count }: { count: number }) {
  return (
    <Link
      href="/vitrina"
      data-testid="platinum-counter"
      className="group inline-flex min-h-11 items-center gap-2 rounded-chip border border-platinum-deep/70 bg-surface px-3 py-1 shadow-[0_0_12px_var(--platinum-glow)] transition-colors hover:border-trophy-platinum focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink sm:min-h-9"
    >
      <PlatinumTrophy size={22} className="transition-transform group-hover:scale-110" />
      <span className="type-meta text-ink">
        <span className="font-semibold tabular-nums text-trophy-platinum">
          {count.toLocaleString("es-AR")}
        </span>{" "}
        {count === 1 ? "platino" : "platinos"}
      </span>
      <span className="sr-only">: ver la vitrina</span>
    </Link>
  );
}
