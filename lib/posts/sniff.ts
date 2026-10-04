/**
 * Tipo REAL de un archivo por sus primeros bytes ("magic bytes"), para no
 * confiar en la extensión ni en el `type` que manda el navegador (que sale de
 * la extensión). Lo usan el compositor antes de subir y `confirmPost` sobre los
 * primeros bytes del objeto ya subido. Módulo puro.
 */
import type { AcceptedMediaType } from "./constants";

/** Cuántos bytes hacen falta para reconocer cualquiera de los formatos. */
export const SNIFF_BYTES = 64;

export type SniffedType = AcceptedMediaType | "image/heic";

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length && i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);
/** Átomos con los que arranca un .mov viejo, sin caja `ftyp`. */
const BARE_QUICKTIME_ATOMS = new Set(["moov", "mdat", "wide", "free", "skip", "pnot"]);

/** Las marcas compatibles de una caja `ftyp` (después de la marca principal y la versión). */
function compatibleBrands(bytes: Uint8Array): string[] {
  const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const end = Math.min(boxSize, bytes.length);
  const brands: string[] = [];
  for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(ascii(bytes, offset, 4));
  return brands;
}

/** El tipo detectado, o null si no es ninguno de los formatos admitidos. */
export function sniffMediaType(bytes: Uint8Array): SniffedType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  const head6 = ascii(bytes, 0, 6);
  if (head6 === "GIF87a" || head6 === "GIF89a") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";

  const atom = ascii(bytes, 4, 4);
  if (atom === "ftyp") {
    const major = ascii(bytes, 8, 4);
    const brands = [major, ...compatibleBrands(bytes)];
    if (AVIF_BRANDS.has(major)) return "image/avif";
    if (HEIC_BRANDS.has(major)) return "image/heic";
    if (major === "qt  ") return "video/quicktime";
    if (brands.some((brand) => AVIF_BRANDS.has(brand))) return "image/avif";
    return "video/mp4";
  }
  if (BARE_QUICKTIME_ATOMS.has(atom)) return "video/quicktime";
  return null;
}

/**
 * ¿Los bytes son del tipo declarado? MP4 y MOV comparten contenedor (ISO BMFF)
 * y los navegadores etiquetan uno como el otro según la extensión, así que se
 * aceptan entre sí: lo que importa es que sea video y que se pueda reproducir
 * (eso lo comprueba el compositor cargándolo en un `<video>`).
 */
export function sniffMatchesDeclared(declared: string, bytes: Uint8Array): boolean {
  const sniffed = sniffMediaType(bytes);
  if (sniffed === null || sniffed === "image/heic") return false;
  if (sniffed === declared) return true;
  const isoVideo = new Set(["video/mp4", "video/quicktime"]);
  return isoVideo.has(sniffed) && isoVideo.has(declared);
}
