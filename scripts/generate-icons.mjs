/**
 * Genera los íconos de la app (PWA, apple-touch-icon y favicon) a partir de una
 * sola marca: un trofeo plateado con el anillo rosa del logo (la "O" con la
 * cruceta de "PLATINOOB").
 *
 * Se corre a mano (`node scripts/generate-icons.mjs`) y los archivos resultantes
 * se commitean: no hace falta en cada build, y `sharp` sólo está disponible como
 * dependencia transitiva de Next.
 *
 * El fondo es el `--background` de la app (`#0f1721`, el `background_color` del
 * manifest) con un halo apenas más claro detrás del trofeo. Antes era un negro
 * distinto del de la pantalla de carga de Android, que mostraba el ícono como un
 * cuadrado oscuro flotando sobre otro fondo; ahora los bordes se funden con él.
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const BACKGROUND = "#0f1721";

// La marca vive en un lienzo de 100×100 con el centro óptico en (50, 50). Los
// asas son trazos y no rellenos: la versión anterior las recortaba de un
// relleno con un path a mano, y a tamaño de launcher se veían rotas.
const MARK = `
  <defs>
    <linearGradient id="silver" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.45" stop-color="#d4dce6"/>
      <stop offset="1" stop-color="#8794a6"/>
    </linearGradient>
    <linearGradient id="silver-dark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b9c4d2"/>
      <stop offset="1" stop-color="#6f7c8f"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.46" r="0.5">
      <stop offset="0" stop-color="#22344c"/>
      <stop offset="1" stop-color="${BACKGROUND}" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <circle cx="50" cy="47" r="44" fill="url(#halo)"/>
  <g fill="none" stroke="url(#silver-dark)" stroke-width="5" stroke-linecap="round">
    <path d="M29 29 H21.5 C21.5 41 25.5 47.5 33 49.5"/>
    <path d="M71 29 H78.5 C78.5 41 74.5 47.5 67 49.5"/>
  </g>
  <path fill="url(#silver)" d="M28 24 H72 V37 C72 51.5 62.5 61 50 61 C37.5 61 28 51.5 28 37 Z"/>
  <rect x="25.5" y="20" width="49" height="6.5" rx="2" fill="url(#silver)"/>
  <path fill="url(#silver-dark)" d="M46 60 H54 L55.5 70 H44.5 Z"/>
  <rect x="38" y="69" width="24" height="5" rx="1.5" fill="url(#silver)"/>
  <rect x="32" y="73.5" width="36" height="7.5" rx="2" fill="url(#silver-dark)"/>
  <g filter="url(#glow)">
    <circle cx="50" cy="40" r="10.5" fill="#1a0f1e" stroke="#ff2d95" stroke-width="3.2"/>
    <path fill="#ff2d95" d="M48.2 34.5 H51.8 V38.2 H55.5 V41.8 H51.8 V45.5 H48.2 V41.8 H44.5 V38.2 H48.2 Z"/>
  </g>`;

/**
 * - `any`: la marca casi a lienzo completo, para el listado de apps y el
 *   apple-touch-icon (iOS no recorta, redondea el cuadrado él mismo).
 * - `maskable`: Android recorta hasta un 20% de cada borde, así que la marca va
 *   dentro del "safe zone" (círculo de radio 40% del lienzo).
 */
function svg({ size, maskable, rounded }) {
  const scale = maskable ? 0.74 : 0.92;
  const offset = (100 - 100 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" ${rounded ? 'rx="22" ' : ""}fill="${BACKGROUND}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${MARK}</g>
</svg>`;
}

const targets = [
  { file: "public/icon-192.png", size: 192, maskable: false },
  { file: "public/icon-512.png", size: 512, maskable: false },
  { file: "public/icon-maskable-512.png", size: 512, maskable: true },
  // En `app/` y no en `public/`: es una convención de archivo de
  // metadata de Next, que sola agrega el <link rel="apple-touch-icon">.
  { file: "app/apple-icon.png", size: 180, maskable: false },
];

for (const { file, size, maskable } of targets) {
  const buf = await sharp(Buffer.from(svg({ size, maskable, rounded: false }))).png().toBuffer();
  writeFileSync(file, buf);
  console.log(file, buf.length);
}

// El favicon es el mismo SVG (redondeado: en la pestaña no lo recorta nadie).
writeFileSync("app/icon.svg", svg({ size: 32, maskable: false, rounded: true }).replace(/ width="32" height="32"/, "") + "\n");
console.log("app/icon.svg");
