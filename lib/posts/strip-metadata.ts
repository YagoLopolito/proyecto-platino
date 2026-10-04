/**
 * Saca la metadata (EXIF, XMP, IPTC: ahí vive la ubicación GPS de una foto de
 * celular) SIN recomprimir: se recortan bloques del contenedor y los bytes de la
 * imagen quedan idénticos. Corre en el cliente antes de subir. Módulo puro.
 *
 * - JPEG: fuera APP1 (EXIF/XMP) y APP13 (IPTC). La orientación vive en el EXIF,
 *   así que si no era la normal se vuelve a escribir un EXIF mínimo con SOLO esa
 *   etiqueta: si no, una foto vertical de celular aparecería acostada.
 * - PNG: fuera los chunks eXIf, tEXt, iTXt, zTXt y tIME.
 * - WebP: fuera los chunks EXIF y "XMP " (y se apagan sus flags en VP8X).
 * - GIF no tiene EXIF. AVIF (ISO BMFF) y los videos quedan como están: ver
 *   CLAUDE.md, sección Galería online.
 */

export interface StripResult {
  bytes: Uint8Array;
  /** true si se sacó algo. */
  changed: boolean;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Orientación EXIF (1..8) de un segmento APP1, o null. */
export function readExifOrientation(app1Payload: Uint8Array): number | null {
  // "Exif\0\0" + cabecera TIFF.
  if (
    app1Payload.length < 14 ||
    String.fromCharCode(...app1Payload.subarray(0, 4)) !== "Exif"
  ) {
    return null;
  }
  const tiff = app1Payload.subarray(6);
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!little && !big) return null;
  const u16 = (o: number) => (little ? tiff[o] | (tiff[o + 1] << 8) : (tiff[o] << 8) | tiff[o + 1]);
  const u32 = (o: number) =>
    little
      ? (tiff[o] | (tiff[o + 1] << 8) | (tiff[o + 2] << 16) | (tiff[o + 3] << 24)) >>> 0
      : ((tiff[o] << 24) | (tiff[o + 1] << 16) | (tiff[o + 2] << 8) | tiff[o + 3]) >>> 0;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** Segmento APP1 completo (marker incluido) con un EXIF de una sola etiqueta: Orientation. */
export function buildOrientationApp1(orientation: number): Uint8Array {
  const payload = new Uint8Array([
    // "Exif\0\0"
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    // TIFF big-endian, IFD0 en el offset 8
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    // 1 entrada: 0x0112 SHORT x1 = orientation
    0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,
    0x00, orientation, 0x00, 0x00,
    // sin IFD siguiente
    0x00, 0x00, 0x00, 0x00,
  ]);
  const length = payload.length + 2;
  return concat([new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff]), payload]);
}

export function stripJpegMetadata(bytes: Uint8Array): StripResult {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return { bytes, changed: false };
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientation: number | null = null;
  let changed = false;
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return { bytes, changed: false }; // estructura rara: no tocar
    const marker = bytes[offset + 1];
    // Relleno entre segmentos.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // SOS: de acá en adelante son los datos de la imagen, se copian tal cual.
    if (marker === 0xda) {
      kept.push(bytes.subarray(offset));
      offset = bytes.length;
      break;
    }
    const length = readUint16BE(bytes, offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) return { bytes, changed: false };
    const segment = bytes.subarray(offset, end);
    if (marker === 0xe1 || marker === 0xed) {
      if (marker === 0xe1 && orientation === null) {
        orientation = readExifOrientation(segment.subarray(4));
      }
      changed = true;
    } else {
      kept.push(segment);
    }
    offset = end;
  }

  if (!changed) return { bytes, changed: false };
  if (orientation !== null && orientation !== 1) {
    // Justo después de SOI (y del APP0/JFIF si está primero, que es lo esperado).
    const insertAt = kept.length > 1 && kept[1][1] === 0xe0 ? 2 : 1;
    kept.splice(insertAt, 0, buildOrientationApp1(orientation));
  }
  return { bytes: concat(kept), changed: true };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROP = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);

export function stripPngMetadata(bytes: Uint8Array): StripResult {
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return { bytes, changed: false };
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let changed = false;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (end > bytes.length) return { bytes, changed: false };
    if (PNG_DROP.has(type)) changed = true;
    else kept.push(bytes.subarray(offset, end));
    offset = end;
    if (type === "IEND") break;
  }
  return changed ? { bytes: concat(kept), changed: true } : { bytes, changed: false };
}

export function stripWebpMetadata(bytes: Uint8Array): StripResult {
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WEBP") return { bytes, changed: false };
  const kept: Uint8Array[] = [];
  let changed = false;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourcc = tag(offset);
    const size = readUint32LE(bytes, offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (offset + 8 + size > bytes.length) return { bytes, changed: false };
    const chunk = bytes.subarray(offset, Math.min(end, bytes.length));
    if (fourcc === "EXIF" || fourcc === "XMP ") {
      changed = true;
    } else if (fourcc === "VP8X") {
      const copy = chunk.slice();
      // Flags: bit 3 = EXIF, bit 2 = XMP.
      copy[8] &= ~(0x08 | 0x04);
      kept.push(copy);
    } else {
      kept.push(chunk);
    }
    offset = end;
  }
  if (!changed) return { bytes, changed: false };
  const body = concat(kept);
  const riffSize = body.length + 4;
  const header = new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    riffSize & 0xff, (riffSize >> 8) & 0xff, (riffSize >> 16) & 0xff, (riffSize >> 24) & 0xff,
    0x57, 0x45, 0x42, 0x50,
  ]);
  return { bytes: concat([header, body]), changed: true };
}

/** Saca la metadata según el tipo; lo que no sabe limpiar lo devuelve igual. */
export function stripMetadata(mimeType: string, bytes: Uint8Array): StripResult {
  switch (mimeType) {
    case "image/jpeg":
      return stripJpegMetadata(bytes);
    case "image/png":
      return stripPngMetadata(bytes);
    case "image/webp":
      return stripWebpMetadata(bytes);
    default:
      return { bytes, changed: false };
  }
}
