/**
 * Genera los íconos PNG de la PWA a partir del mismo trofeo que `app/icon.svg`.
 *
 * Se corre a mano (`node scripts/generate-icons.mjs`) y los PNG resultantes se
 * commitean: no hace falta en cada build, y `sharp` sólo está disponible como
 * dependencia transitiva de Next.
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const TROPHY = `<path fill="#b9e1ff" d="M6 3h12v2h2a1 1 0 0 1 1 1v1c0 2.5-1.7 4.6-4 5.3-.7 1.6-2.1 2.8-3.8 3.2V18h2.3a1 1 0 0 1 1 1v1H8.5v-1a1 1 0 0 1 1-1H11.8v-2.5c-1.7-.4-3.1-1.6-3.8-3.2C5.7 11.6 4 9.5 4 7V6a1 1 0 0 1 1-1h1V3Zm0 4H5v0c0 1.5.8 2.8 2 3.6V7Zm12 0v3.6c1.2-.8 2-2.1 2-3.6h-1V7h-1Z"/>`;

// `any`: el ícono ocupa el lienzo completo, para el listado de apps y el
// apple-touch-icon (iOS no recorta, redondea el cuadrado él mismo).
// `maskable`: Android recorta hasta un 20% de cada borde, así que el trofeo va
// dentro del "safe zone" del 80% central sobre fondo pleno.
function svg({ size, maskable }) {
  const scale = maskable ? 0.56 : 0.74;
  const inner = 24 * scale;
  const offset = (24 - inner) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <rect width="24" height="24" ${maskable ? "" : 'rx="5" '}fill="#0a0e17"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${TROPHY}</g>
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
  const buf = await sharp(Buffer.from(svg({ size, maskable }))).png().toBuffer();
  writeFileSync(file, buf);
  console.log(file, buf.length);
}
