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

/**
 * Los tres primeros salen de los tokens `rarity-*` de `app/globals.css`;
 * "común" va con `ink-muted`, que es el nivel de "un metadato más": un cuarto
 * color para decir "nada especial" sería ruido (issue #176).
 */
export const RARITY_CLASS: Record<number, string> = {
  0: "border-rarity-ultra/40 bg-rarity-ultra/10 text-rarity-ultra",
  1: "border-rarity-very/40 bg-rarity-very/10 text-rarity-very",
  2: "border-rarity-rare/40 bg-rarity-rare/10 text-rarity-rare",
  3: "border-border bg-surface-hover text-ink-muted",
};

export function rarityLabel(rarity: number | null): string | null {
  return rarity !== null && rarity in RARITY_LABEL ? RARITY_LABEL[rarity] : null;
}
