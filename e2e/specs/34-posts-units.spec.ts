import { test, expect } from "@playwright/test";
import {
  MAX_FILES_PER_POST,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  buildMediaPath,
  displayPathFor,
  parseMediaPath,
  posterPathFor,
} from "../../lib/posts/constants";
import { confirmPostSchema, validateFile, validateFiles } from "../../lib/posts/validation";
import { sniffMatchesDeclared, sniffMediaType } from "../../lib/posts/sniff";
import {
  readExifOrientation,
  stripJpegMetadata,
  stripPngMetadata,
  stripWebpMetadata,
} from "../../lib/posts/strip-metadata";
import { pageCount, pageHref, pageRange, pageWindow, parsePageParam } from "../../lib/posts/pagination";
import { moveItem, removeItem, sortGamesPlayingFirst } from "../../lib/posts/order";
import { relativeTime } from "../../lib/activity/format";

/**
 * Galería online: lógica pura (validación, tipo real, limpieza de EXIF,
 * paginación, orden). Casos POST-01..POST-08 de TESTING_PRD.md §6.19. No
 * levantan navegador: importan los módulos directo, como `steam-relevance`.
 */

const image = (size = 1024, type = "image/jpeg", name = "captura.jpg") => ({ name, type, size });

test.describe("Validación de archivos", () => {
  test("POST-01: cantidad 0 / 1 / 10 / 11", () => {
    expect(validateFiles([]).countError).toMatch(/al menos una/);
    expect(validateFiles([image()]).ok).toBe(true);
    expect(validateFiles(Array.from({ length: MAX_FILES_PER_POST }, () => image())).ok).toBe(true);
    const eleven = validateFiles(Array.from({ length: MAX_FILES_PER_POST + 1 }, () => image()));
    expect(eleven.ok).toBe(false);
    expect(eleven.countError).toMatch(/hasta 10/);
  });

  test("POST-02: tipo y tamaño por archivo, con HEIC explicado", () => {
    expect(validateFile(image(1024, "application/pdf", "doc.pdf"))).toMatch(/no es un formato/);
    expect(validateFile(image(1024, "image/heic", "IMG_0001.HEIC"))).toMatch(/HEIC/);
    // Algunos navegadores no le ponen type a un .heic: cuenta la extensión.
    expect(validateFile(image(1024, "", "IMG_0001.heic"))).toMatch(/HEIC/);
    expect(validateFile(image(MAX_IMAGE_BYTES))).toBeNull();
    expect(validateFile(image(MAX_IMAGE_BYTES + 1))).toMatch(/máximo para una imagen es 20 MB/);
    expect(validateFile(image(MAX_VIDEO_BYTES, "video/mp4", "clip.mp4"))).toBeNull();
    expect(validateFile(image(MAX_VIDEO_BYTES + 1, "video/mp4", "clip.mp4"))).toMatch(
      /máximo para un video es 50 MB/,
    );
    expect(validateFile(image(0))).toMatch(/vacío/);
  });

  test("POST-03: confirmar exige posiciones 0..N-1 sin huecos", () => {
    const media = (position: number) => ({
      position,
      storagePath: `a/b/${position}.jpg`,
      displayPath: null,
      posterPath: null,
      mimeType: "image/jpeg",
      width: 1920,
      height: 1080,
      durationSeconds: null,
    });
    const postId = "00000000-0000-4000-8000-000000000000";
    expect(confirmPostSchema.safeParse({ postId, media: [media(1), media(0)] }).success).toBe(true);
    expect(confirmPostSchema.safeParse({ postId, media: [media(0), media(2)] }).success).toBe(false);
    expect(confirmPostSchema.safeParse({ postId, media: [] }).success).toBe(false);
  });

  test("POST-03b: paths del bucket atados a usuario y post", () => {
    const user = "11111111-1111-4111-8111-111111111111";
    const post = "22222222-2222-4222-8222-222222222222";
    const path = buildMediaPath(user, post, 3, "video/quicktime", "abc");
    expect(path).toBe(`${user}/${post}/3-abc.mov`);
    expect(parseMediaPath(path)).toEqual({ userId: user, postId: post });
    expect(parseMediaPath("../otro/archivo.jpg")).toBeNull();
    expect(displayPathFor(path)).toBe(`${user}/${post}/3-abc-display.webp`);
    expect(posterPathFor(path)).toBe(`${user}/${post}/3-abc-poster.jpg`);
  });
});

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])),
  );

test.describe("Tipo real por magic bytes", () => {
  test("POST-04: reconoce los formatos y rechaza lo renombrado", () => {
    expect(sniffMediaType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMediaType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffMediaType(bytes("GIF89a"))).toBe("image/gif");
    expect(sniffMediaType(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
    expect(sniffMediaType(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("video/webm");
    expect(sniffMediaType(bytes(0, 0, 0, 0x18, "ftypisom", 0, 0, 0, 0))).toBe("video/mp4");
    expect(sniffMediaType(bytes(0, 0, 0, 0x14, "ftypqt  ", 0, 0, 0, 0))).toBe("video/quicktime");
    expect(sniffMediaType(bytes(0, 0, 0, 0x14, "ftypavif", 0, 0, 0, 0))).toBe("image/avif");
    expect(sniffMediaType(bytes(0, 0, 0, 0x14, "ftypheic", 0, 0, 0, 0))).toBe("image/heic");
    // Un .txt renombrado a .jpg.
    expect(sniffMediaType(bytes("hola mundo"))).toBeNull();
    expect(sniffMatchesDeclared("image/jpeg", bytes("hola mundo"))).toBe(false);
    // MP4 y MOV comparten contenedor: se aceptan entre sí.
    expect(sniffMatchesDeclared("video/quicktime", bytes(0, 0, 0, 0x18, "ftypisom"))).toBe(true);
    expect(sniffMatchesDeclared("image/png", bytes(0xff, 0xd8, 0xff))).toBe(false);
    // HEIC con extensión cambiada: no pasa.
    expect(sniffMatchesDeclared("video/mp4", bytes(0, 0, 0, 0x14, "ftypheic"))).toBe(false);
  });
});

/** JPEG mínimo: SOI, APP0, APP1 (EXIF con orientación 6 + "GPS"), DQT, SOS + datos, EOI. */
function jpegWithGps(): { file: Uint8Array; imageData: Uint8Array } {
  const exif = bytes(
    "Exif", 0, 0,
    "MM", 0, 0x2a, 0, 0, 0, 8,
    0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0,
    0, 0, 0, 0,
    "GPSLatitude-34.6037",
  );
  const app1 = bytes(0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff);
  const app0Payload = bytes("JFIF", 0, 1, 1, 0, 0, 1, 0, 1, 0, 0);
  const app0 = bytes(0xff, 0xe0, 0, app0Payload.length + 2);
  const dqt = bytes(0xff, 0xdb, 0, 4, 0, 1);
  const imageData = bytes(0xff, 0xda, 0, 2, 1, 2, 3, 4, 5, 0xff, 0x00, 6, 0xff, 0xd9);
  const file = new Uint8Array([
    0xff, 0xd8, ...app0, ...app0Payload, ...app1, ...exif, ...dqt, ...imageData,
  ]);
  return { file, imageData };
}

const text = (data: Uint8Array) => String.fromCharCode(...data);

test.describe("Limpieza de metadata sin recomprimir", () => {
  test("POST-05: JPEG pierde el GPS, conserva la orientación y los bytes de imagen", () => {
    const { file, imageData } = jpegWithGps();
    expect(text(file)).toContain("GPSLatitude");
    const { bytes: out, changed } = stripJpegMetadata(file);
    expect(changed).toBe(true);
    expect(text(out)).not.toContain("GPSLatitude");
    // Los datos de imagen (desde SOS) quedan idénticos: no se recomprimió nada.
    expect([...out.subarray(out.length - imageData.length)]).toEqual([...imageData]);
    // La orientación vuelve como un EXIF mínimo, justo después del APP0.
    const app1Start = text(out).indexOf("Exif") - 4;
    expect(out[app1Start + 1]).toBe(0xe1);
    expect(readExifOrientation(out.subarray(app1Start + 4))).toBe(6);
  });

  test("POST-05b: PNG y WebP pierden sus chunks de metadata", () => {
    const chunk = (type: string, data: Uint8Array) =>
      bytes(0, 0, 0, data.length, type, ...data, 0, 0, 0, 0);
    const png = new Uint8Array([
      ...bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a),
      ...chunk("IHDR", bytes(0, 0, 0, 1)),
      ...chunk("eXIf", bytes("GPS")),
      ...chunk("tEXt", bytes("GPS")),
      ...chunk("IDAT", bytes(9, 9)),
      ...chunk("IEND", bytes()),
    ]);
    const cleanPng = stripPngMetadata(png);
    expect(cleanPng.changed).toBe(true);
    expect(text(cleanPng.bytes)).not.toContain("GPS");
    expect(text(cleanPng.bytes)).toContain("IDAT");

    const webpChunk = (fourcc: string, data: Uint8Array) =>
      bytes(fourcc, data.length, 0, 0, 0, ...data, ...(data.length % 2 ? [0] : []));
    const body = new Uint8Array([
      ...webpChunk("VP8X", bytes(0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0)),
      ...webpChunk("VP8 ", bytes(1, 2, 3, 4)),
      ...webpChunk("EXIF", bytes("GPS!")),
    ]);
    const size = body.length + 4;
    const webp = new Uint8Array([...bytes("RIFF", size, 0, 0, 0, "WEBP"), ...body]);
    const cleanWebp = stripWebpMetadata(webp);
    expect(cleanWebp.changed).toBe(true);
    expect(text(cleanWebp.bytes)).not.toContain("GPS");
    // El tamaño del RIFF se recalcula y los flags de EXIF/XMP se apagan.
    expect(cleanWebp.bytes[4]).toBe(cleanWebp.bytes.length - 8);
    expect(cleanWebp.bytes[20] & 0x0c).toBe(0);
  });
});

test.describe("Orden y paginación", () => {
  test("POST-06: reordenar y quitar del carrusel", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(removeItem(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  test("POST-07: el selector pone primero lo que estás jugando", () => {
    const playing = [{ id: "3", name: "Zelda" }, { id: "1", name: "Astro Bot" }];
    const others = [
      { id: "2", name: "bloodborne" },
      { id: "1", name: "Astro Bot" },
      { id: "4", name: "Ápex" },
    ];
    expect(sortGamesPlayingFirst(playing, others).map((g) => g.id)).toEqual(["3", "1", "4", "2"]);
  });

  test("POST-08: páginas, rango, fuera de rango y elipsis", () => {
    expect(pageCount(0, 30)).toBe(1);
    expect(pageCount(30, 30)).toBe(1);
    expect(pageCount(31, 30)).toBe(2);
    expect(pageRange(3, 30)).toEqual({ from: 60, to: 89 });
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-2")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam("7")).toBe(7);
    const labels = (current: number, total: number) =>
      pageWindow(current, total).map((item) => (item.type === "page" ? item.page : "…"));
    expect(labels(1, 1)).toEqual([1]);
    expect(labels(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
    expect(labels(2, 10)).toEqual([1, 2, 3, "…", 10]);
    // Un hueco de un solo número se muestra como ese número.
    expect(labels(4, 10)).toEqual([1, 2, 3, 4, 5, "…", 10]);
    // Una página pedida fuera de rango se dibuja como la última.
    expect(labels(99, 3)).toEqual([1, 2, 3]);
    expect(pageHref("/actividad/galeria", 1)).toBe("/actividad/galeria");
    expect(pageHref("/actividad/galeria", 3)).toBe("/actividad/galeria?page=3");
  });

  test("POST-08b: fecha relativa del post", () => {
    const now = Date.parse("2026-10-04T12:00:00Z");
    expect(relativeTime("2026-10-04T11:59:30Z", now)).toBe("ahora");
    expect(relativeTime("2026-10-04T09:00:00Z", now)).toBe("3 h");
    expect(relativeTime("2026-09-20T12:00:00Z", now)).toBe("2 sem");
  });
});
