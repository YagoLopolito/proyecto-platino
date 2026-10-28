/**
 * Segunda pasada sobre `public/trophy-platinum.webp` (el trofeo de fallback
 * del platino, ver `lib/platinum/assets.ts`). La primera,
 * `generate-platinum-trophy.mjs`, sacaba el damero pintado del PNG original
 * pero dejaba restos grises entre las cintas y le hacía un agujero al
 * pedestal (su brillo blanco coincidía con el blanco del damero).
 *
 * Se corre a mano (`node scripts/clean-platinum-trophy.mjs`) sobre el WebP ya
 * commiteado, y el resultado se commitea.
 */
import sharp from "sharp";

const FILE = "public/trophy-platinum.webp";
const { data, info } = await sharp(FILE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const alpha = (p) => data[p * 4 + 3];
const neighbours = (p) => {
  const x = p % W;
  const out = [];
  if (x > 0) out.push(p - 1);
  if (x < W - 1) out.push(p + 1);
  if (p >= W) out.push(p - W);
  if (p < W * (H - 1)) out.push(p + W);
  return out;
};
const neutralAbove = (p, min) => {
  const [r, g, b] = [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];
  return Math.max(r, g, b) - Math.min(r, g, b) < 18 && Math.min(r, g, b) > min;
};

// 1) El fondo de afuera: transparente y conectado al borde de la imagen.
const outside = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
while (stack.length) {
  const p = stack.pop();
  if (outside[p] || alpha(p) > 40) continue;
  outside[p] = 1;
  stack.push(...neighbours(p));
}

// 2) El pedestal: lo transparente encerrado en la franja de abajo es el
// agujero del brillo, no fondo. Se rellena con el promedio de los vecinos.
const baseTop = Math.round(H * 0.82);
const hole = new Set();
for (let p = baseTop * W; p < W * H; p++) if (!outside[p] && alpha(p) < 250) hole.add(p);
for (let round = 0; round < 60 && hole.size > 0; round++) {
  const filled = [];
  for (const p of hole) {
    const solid = neighbours(p).filter((n) => !hole.has(n) && alpha(n) >= 250);
    if (solid.length < 2) continue;
    const avg = [0, 1, 2].map((c) => solid.reduce((s, n) => s + data[n * 4 + c], 0) / solid.length);
    filled.push([p, avg]);
  }
  if (filled.length === 0) break;
  for (const [p, [r, g, b]] of filled) {
    data.set([r, g, b, 255], p * 4);
    hole.delete(p);
  }
}

// 3) Los huecos entre las cintas: desde lo ya transparente (o semi) que quedó
// encerrado, se inunda sobre el gris claro sin saturación que dejó el damero.
// La cuña de arriba a la derecha (entre la esfera y la cinta) quedó opaca y
// sin contacto con ningún hueco: se siembra a mano por su zona.
const gap = new Uint8Array(W * H);
const queue = [];
for (let p = 0; p < baseTop * W; p++) {
  const x = p % W;
  const y = Math.floor(p / W);
  const wedge = x > W * 0.7 && x < W * 0.82 && y > H * 0.12 && y < H * 0.32 && neutralAbove(p, 222);
  if ((!outside[p] && alpha(p) < 200) || wedge) {
    gap[p] = 1;
    queue.push(p);
  }
}
while (queue.length) {
  const p = queue.pop();
  for (const n of neighbours(p)) {
    if (n >= baseTop * W || gap[n] || outside[n] || !neutralAbove(n, 200)) continue;
    gap[n] = 1;
    queue.push(n);
  }
}
for (let p = 0; p < W * H; p++) if (gap[p]) data[p * 4 + 3] = 0;

// 4) Borde: el píxel claro pegado a un hueco queda a media opacidad, así no
// se ve un filo blanco sobre el fondo oscuro de la app.
const soften = [];
for (let p = 0; p < baseTop * W; p++) {
  if (alpha(p) === 0 || !neutralAbove(p, 185)) continue;
  if (neighbours(p).some((n) => gap[n])) soften.push(p);
}
for (const p of soften) data[p * 4 + 3] = Math.round(alpha(p) * 0.45);

const output = await sharp(data, { raw: info }).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
await sharp(output).toFile(FILE);
