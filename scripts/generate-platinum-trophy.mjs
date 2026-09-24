/**
 * Genera `public/trophy-platinum.webp`, el trofeo de platino de las filas de
 * Actividad, a partir del PNG que aportó el dueño del proyecto (con el damero de transparencia pintado).
 *
 * Se corre a mano (`node scripts/generate-platinum-trophy.mjs <png>`) y el
 * resultado se commitea, igual que `generate-icons.mjs`. El fondo se vuelve
 * transparente: sobre las superficies oscuras de la app un cuadrado blanco se
 * vería como una calcomanía.
 */
import sharp from "sharp";

const [, , input] = process.argv;
if (!input) throw new Error("Uso: node scripts/generate-platinum-trophy.mjs <png>");

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// El PNG trae el "damero" de transparencia pintado (blanco y gris claro).
// Relleno por inundación desde los bordes sobre píxeles claros y sin
// saturación: el plateado del trofeo también es gris, pero no toca el borde.
const { width, height } = info;
const isBackground = (p) => {
  const [r, g, b] = [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];
  return Math.max(r, g, b) - Math.min(r, g, b) < 14 && Math.min(r, g, b) > 185;
};
const seen = new Uint8Array(width * height);
const stack = [];
for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
while (stack.length) {
  const p = stack.pop();
  if (seen[p] || !isBackground(p)) continue;
  seen[p] = 1;
  data[p * 4 + 3] = 0;
  const x = p % width;
  if (x > 0) stack.push(p - 1);
  if (x < width - 1) stack.push(p + 1);
  if (p >= width) stack.push(p - width);
  if (p < width * (height - 1)) stack.push(p + width);
}

// Los huecos entre las cintas quedan encerrados y el relleno no llega. Ahí se
// usa la grilla del damero: casillas de 15px, blanco (255) en la (0,0) y gris
// (238) alternando. Un píxel es fondo si tiene exactamente el color que le toca
// a su casilla **y** su vecino a 15px (casilla contigua) tiene el opuesto. Los
// blancos del globo no siguen esa grilla y se quedan.
const CELL = 15;
const expected = (x, y) => ((Math.floor(x / CELL) + Math.floor(y / CELL)) % 2 === 0 ? 255 : 238);
const exact = (x, y, v) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const i = (y * width + x) * 4;
  return data[i] === v && Math.abs(data[i + 1] - v) <= 1 && Math.abs(data[i + 2] - v) <= 1;
};
const clear = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const v = expected(x, y);
    if (!exact(x, y, v)) continue;
    const opposite = v === 255 ? 238 : 255;
    const neighbours = [
      [x + CELL, y], [x - CELL, y], [x, y + CELL], [x, y - CELL],
    ].filter(([nx, ny]) => exact(nx, ny, opposite)).length;
    if (neighbours >= 2) clear.push(y * width + x);
  }
}
for (const p of clear) data[p * 4 + 3] = 0;

await sharp(data, { raw: info })
  .trim()
  .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .webp({ quality: 90, alphaQuality: 100 })
  .toFile("public/trophy-platinum.webp");
