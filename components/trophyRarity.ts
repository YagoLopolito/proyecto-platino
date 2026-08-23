/**
 * Rareza tal cual la devuelve psn-api (`TrophyRarity`): 0=ultra rara .. 3=común.
 * Cada nivel tiene su propio color para poder distinguirlos de un vistazo en la
 * lista de trofeos (antes todos se pintaban de ámbar y "común" ni se mostraba).
 */
export const RARITY_LABEL: Record<number, string> = {
  0: "Ultra rara",
  1: "Muy rara",
  2: "Rara",
  3: "Común",
};

export const RARITY_CLASS: Record<number, string> = {
  0: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  1: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  2: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  3: "border-zinc-600/60 bg-zinc-700/20 text-zinc-400",
};

export function rarityLabel(rarity: number | null): string | null {
  return rarity !== null && rarity in RARITY_LABEL ? RARITY_LABEL[rarity] : null;
}
