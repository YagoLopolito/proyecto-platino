/**
 * Tiempos de referencia de HowLongToBeat, cargados a mano.
 *
 * HLTB no tiene API pública (ver `igdb.ts`) y la red de este proyecto no lo
 * scrapea, pero es la referencia contra la que el usuario compara: los
 * agregados de IGDB salen de muy pocas partidas (pusieron 348 h de historia en
 * DRAGON BALL Z: KAKAROT y 6,7 h en The Last of Us) y la IA sola subestima
 * casi todo (2 h para 007 First Light, 15 h de 100% para Horizon Zero Dawn).
 * Para los juegos de la biblioteca real, entonces, el número sale de acá
 * antes que de IGDB o del modelo.
 *
 * Los números son los "Main Story" y "Completionist" de HLTB redondeados a
 * media hora, revisados el 2026-10-18 vía los sitios que republican sus datos
 * (DekuDeals, IsThereAnyDeal, PSPrices, PlatPrices). Cambian a medida que la
 * comunidad carga partidas, así que una diferencia de una o dos horas con el
 * sitio no es un error.
 *
 * Puro y sin `server-only` (se testea desde el spec, igual que `match.ts`).
 * La clave es `comparableName`, así que "Assassin's Creed® III Remastered"
 * cae en la misma entrada que "Assassin's Creed III". Cuando el nombre de la
 * tienda no queda igual (sufijos como "Ultimate Edition" o "- The Definitive
 * Edition"), va como alias.
 */
import { comparableName } from "./match";

/** [nombre, horas de historia, horas al 100%, ...alias] */
type ReferenceEntry = readonly [string, number, number, ...string[]];

const ENTRIES: readonly ReferenceEntry[] = [
  ["A Way Out", 6, 7],
  ["ANNO: Mutationem", 11.5, 18.5],
  ["Ape Escape", 7, 11.5],
  ["Assassin's Creed III", 15, 55],
  ["Assassin's Creed Liberation", 8, 16],
  ["Assassin's Creed Shadows", 36, 99.5],
  ["Assassin's Creed Unity", 17, 80],
  ["ASTRO BOT", 11, 18.5],
  ["ASTRONEER", 25.5, 69],
  ["Avatar: Frontiers of Pandora", 23, 84],
  ["Baldur's Gate 3", 73, 181.5],
  ["Batman: Arkham City", 13, 59, "Batman: Arkham City - The Arkham Bundle"],
  ["Batman: The Enemy Within", 10, 11],
  ["BioShock", 12, 23],
  ["Black Myth: Wukong", 38, 67.5],
  ["Bomb Rush Cyberfunk", 10, 24],
  ["Borderlands 4", 30.5, 111],
  ["Broken Age", 10.5, 13.5],
  ["Brotato", 5.5, 61],
  ["Burnout Paradise", 11, 37],
  ["Call of Duty: Black Ops II", 7, 31],
  ["Call of Duty: Black Ops III", 9, 84],
  ["Call of Duty: Modern Warfare II", 8, 27],
  ["Chained Together", 5, 10],
  ["Clair Obscur: Expedition 33", 29.5, 68],
  ["Control", 12.5, 39, "Control Ultimate Edition"],
  ["Crash Team Racing Nitro-Fueled", 5.5, 33.5],
  ["Cyberpunk 2077", 26, 109],
  ["DARK SOULS III", 31, 100.5],
  ["Darkest Dungeon II", 31, 96],
  ["Dead Island 2", 16, 39],
  ["Death Stranding", 40.5, 113],
  ["DEATH STRANDING 2: ON THE BEACH", 36, 117],
  ["Demon's Souls", 24, 60.5],
  ["Detroit: Become Human", 12, 32],
  ["Devil May Cry 5 Special Edition", 10.5, 85],
  ["Diablo IV", 26, 196],
  ["Disco Elysium", 24, 48],
  ["Divinity: Original Sin 2", 59, 158],
  ["DRAGON BALL Z: KAKAROT", 30.5, 55],
  ["DRAGON QUEST XI: Echoes of an Elusive Age", 57, 122.5],
  ["DREDGE", 9.5, 21],
  ["Dying Light 2 Stay Human", 24, 102],
  ["ELDEN RING", 60, 136],
  ["ELDEN RING NIGHTREIGN", 28, 67],
  ["Enter the Gungeon", 22, 160],
  ["F.I.S.T.: Forged In Shadow Torch", 12.5, 20.5],
  ["Far Cry 3", 16, 36.5],
  ["Far Cry 3 Blood Dragon", 4.5, 8.5],
  ["Far Cry 6", 25, 65],
  ["FINAL FANTASY IX", 38, 82],
  ["FINAL FANTASY VII REBIRTH", 48.5, 161],
  ["FINAL FANTASY VII REMAKE", 32.5, 86],
  ["FINAL FANTASY X/X-2 HD Remaster", 50.5, 161],
  ["FINAL FANTASY XV", 27.5, 117],
  ["FINAL FANTASY XVI", 38.5, 82.5],
  ["For The King II", 41, 108.5],
  ["Ghost of Tsushima", 25, 62.5],
  ["Ghost of Yōtei", 30, 60],
  ["God of War III", 10, 18.5],
  ["God of War Ragnarök", 26.5, 55.5],
  ["God of War: Ascension", 8.5, 14],
  ["Grand Theft Auto III", 14, 37, "Grand Theft Auto III – The Definitive Edition"],
  ["Grand Theft Auto V", 32, 89.5],
  ["Grand Theft Auto: San Andreas", 30, 71, "Grand Theft Auto: San Andreas – The Definitive Edition"],
  ["Grand Theft Auto: Vice City", 17, 38, "Grand Theft Auto: Vice City – The Definitive Edition"],
  ["Grounded", 32, 106],
  ["Hades", 23.5, 95],
  ["HEAVY RAIN", 10, 22],
  ["Helldivers 2", 32, 86.5],
  ["Hogwarts Legacy", 26.5, 72],
  ["Hollow Knight", 27, 65.5],
  ["Horizon Forbidden West", 28.5, 90],
  ["Horizon Zero Dawn", 22.5, 61],
  ["inFAMOUS First Light", 4, 9.5],
  ["Injustice 2", 5.5, 53],
  ["Injustice: Gods Among Us", 5, 24.5, "Injustice: Gods Among Us Ultimate Edition"],
  ["It Takes Two", 13, 16.5],
  ["Killzone", 9.5, 20.5],
  ["Killzone 2", 7.5, 19.5],
  ["Killzone Shadow Fall", 10, 92],
  ["Kingdom Come: Deliverance", 43, 136.5],
  ["Kingdom Come: Deliverance II", 55, 141],
  ["KINGDOM HEARTS HD 1.5 + 2.5 ReMIX", 111, 297],
  ["L.A. Noire", 22, 42.5],
  ["Left 4 Dead 2", 10.5, 63],
  ["LEGO Harry Potter Collection", 27, 54],
  ["LEGO Jurassic World", 10.5, 30],
  ["LEGO Star Wars: The Skywalker Saga", 18.5, 89.5],
  ["Lies of P", 28.5, 58.5],
  ["Like a Dragon Gaiden: The Man Who Erased His Name", 12.5, 33.5],
  ["Like a Dragon: Infinite Wealth", 57, 118],
  ["Like a Dragon: Ishin!", 24, 119.5],
  ["Like a Dragon: Pirate Yakuza in Hawaii", 17.5, 44],
  ["Maneater", 8, 13],
  ["Marvel's Guardians of the Galaxy", 17.5, 26],
  ["Marvel's Spider-Man", 18, 45],
  ["Marvel's Spider-Man 2", 17, 29],
  ["Marvel's Spider-Man: Miles Morales", 8, 18.5],
  ["Metal Gear Solid 4: Guns of the Patriots", 18, 35],
  ["Metal Gear Solid V: The Phantom Pain", 45.5, 164],
  ["Metro: Last Light", 10, 27.5, "Metro: Last Light Redux"],
  ["Middle-earth: Shadow of War", 21, 57],
  ["Minecraft", 65.5, 288],
  ["Monster Hunter Wilds", 18, 115],
  ["Moving Out", 5, 19],
  ["No Man's Sky", 32.5, 156],
  ["ONE PIECE: PIRATE WARRIORS 4", 16, 40],
  ["Outer Wilds", 17, 29],
  ["Overcooked! All You Can Eat", 11, 28],
  ["Persona 5 Royal", 101.5, 140.5],
  ["Portal 2", 8.5, 23],
  ["Prince of Persia: The Lost Crown", 16.5, 31.5],
  ["Ratchet & Clank: Rift Apart", 11, 18],
  ["Rayman Legends", 10, 31.5],
  ["Red Dead Redemption", 17.5, 46.5],
  ["Red Dead Redemption 2", 50, 182],
  ["RESIDENT EVIL 5", 12, 35],
  ["RESIDENT EVIL 6", 21, 52.5],
  ["Resident Evil Requiem", 11, 32],
  ["Resident Evil Revelations", 8.5, 38.5],
  ["RESIDENT EVIL REVELATIONS 2", 10.5, 35],
  ["Returnal", 19, 64],
  ["Shadow of the Colossus", 7, 26.5],
  ["Sifu", 8, 22.5],
  ["SILENT HILL 2", 16, 32.5],
  ["Skyrim", 26, 203.5],
  ["SONIC X SHADOW GENERATIONS", 6.5, 29],
  ["South Park: The Stick of Truth", 11.5, 21],
  ["STAR WARS Jedi: Survivor", 20.5, 55.5],
  ["Star Wars Outlaws", 18.5, 66.5],
  ["Stardew Valley", 53, 172],
  ["Stray", 5, 10.5],
  ["The Binding of Isaac: Rebirth", 6, 393],
  ["The Last of Us Part I", 14.5, 24.5],
  ["The Last of Us Part II Remastered", 23, 45],
  ["The Last of Us Remastered", 14.5, 33.5],
  ["The Order: 1886", 7, 10.5],
  ["The Plucky Squire", 8.5, 10.5],
  ["The Quarry", 9, 33.5],
  ["The Walking Dead: The Telltale Definitive Series", 42, 48],
  ["The Witcher 3: Wild Hunt", 51.5, 175],
  ["Tomb Raider: Definitive Edition", 11, 21],
  ["Uncharted: Drake's Fortune", 8, 18],
  ["Undertale", 7, 20.5],
  ["Until Dawn", 8, 19],
  ["Warhammer 40,000: Space Marine 2", 9.5, 66.5],
  ["Watch Dogs: Legion", 18, 50.5],
  ["What Remains of Edith Finch", 2, 3],
  ["Wolfenstein: The Old Blood", 6, 16],
  ["Yakuza: Like a Dragon", 46, 103],
];

export interface ReferenceTimes {
  beatMinutes: number;
  completeMinutes: number;
}

const BY_NAME = new Map<string, ReferenceTimes>();
for (const [name, beatHours, completeHours, ...aliases] of ENTRIES) {
  const times = { beatMinutes: beatHours * 60, completeMinutes: completeHours * 60 };
  for (const key of [name, ...aliases]) BY_NAME.set(comparableName(key), times);
}

/** Tiempos de HLTB para el juego, o `null` si no está en la tabla. */
export function findReferenceTimes(gameName: string): ReferenceTimes | null {
  const key = comparableName(gameName);
  return key ? (BY_NAME.get(key) ?? null) : null;
}
