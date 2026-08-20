import { TrophyTypeIcon } from "./TrophyTypeIcon";

/** Marca de producto mostrada arriba de los forms de login/registro. */
export function AuthBrandMark() {
  return (
    <div className="mb-6 flex items-center justify-center gap-2 text-[var(--color-trophy-platinum)]">
      <TrophyTypeIcon type="platinum" className="h-6 w-6" />
      <span className="text-lg font-semibold tracking-tight text-zinc-50">Platino</span>
    </div>
  );
}
