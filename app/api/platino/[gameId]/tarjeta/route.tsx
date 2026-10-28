import { ImageResponse } from "next/og";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPlatinumCollection } from "@/lib/platinum/queries";
import { PLATINUM_TROPHY_SRC, TROPHY_VECTOR_PATH } from "@/lib/platinum/assets";
import { formatEarnedRate, formatPlatinumDate } from "@/lib/platinum/stats";

/**
 * Card "¡Platiné X!" (1080×1350, el 4:5 vertical que mejor entra en el
 * carrusel de la Galería online). La genera el servidor con `next/og`, como
 * `app/opengraph-image.tsx`, y el navegador la publica por el mismo flujo de
 * tres pasos que cualquier foto (`publishFiles`): este route sólo dibuja, no
 * sube nada.
 *
 * Sólo para un platino de quien la pide: la colección sale del RPC con la
 * sesión, así que un `gameId` ajeno o sin platino da 404.
 *
 * Satori (el renderer) no lee variables CSS ni WebP, así que los colores van
 * en hex (los mismos valores que los tokens de `globals.css`) y las imágenes
 * que no son PNG/JPEG se reemplazan: la carátula por un marco vacío y el
 * trofeo por la copa vectorial.
 */
export const dynamic = "force-dynamic";

const SIZE = { width: 1080, height: 1350 };

// Valores de los tokens de `app/globals.css` (Satori no lee `var(--…)`).
const COLORS = {
  background: "#0c1420",
  surface: "#16202f",
  ink: "#eef2f8",
  muted: "#a3adbf",
  platinum: "#b9e1ff",
  platinumLight: "#f1f8ff",
  platinumDeep: "#5f84a6",
};

const FETCH_TIMEOUT_MS = 4000;

/** Una imagen remota como data URI, sólo si es PNG o JPEG (lo que Satori dibuja). */
async function imageAsDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (type !== "image/png" && type !== "image/jpeg") return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function vectorTrophy(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${COLORS.platinum}"><path d="${TROPHY_VECTOR_PATH}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function GET(request: Request, ctx: { params: Promise<{ gameId: string }> }) {
  const parsed = z
    .string()
    .uuid()
    .safeParse((await ctx.params).gameId);
  if (!parsed.success) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [collection, { data: profile }] = await Promise.all([
    getPlatinumCollection(supabase),
    supabase.from("public_profiles").select("profile_name").eq("id", user.id).maybeSingle(),
  ]);
  const piece = collection.find((item) => item.gameId === parsed.data);
  if (!piece) return new Response("Not found", { status: 404 });

  const origin = new URL(request.url).origin;
  const [cover, officialTrophy] = await Promise.all([
    piece.imageUrl ? imageAsDataUri(piece.imageUrl) : Promise.resolve(null),
    imageAsDataUri(`${origin}${PLATINUM_TROPHY_SRC}`),
  ]);
  const trophy = officialTrophy ?? vectorTrophy();

  const details = [
    `Platino #${piece.number}`,
    formatPlatinumDate(piece.unlockedAt),
    piece.earnedRate !== null ? `${formatEarnedRate(piece.earnedRate)} de los jugadores` : null,
  ].filter(Boolean);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: `radial-gradient(circle at 50% 30%, #23344d 0%, ${COLORS.background} 62%)`,
        color: COLORS.ink,
        padding: "72px 64px 56px",
      }}
    >
      <div style={{ position: "relative", display: "flex", marginBottom: 72 }}>
        <div
          style={{
            display: "flex",
            padding: 6,
            borderRadius: 30,
            background: `linear-gradient(135deg, ${COLORS.platinumLight}, ${COLORS.platinum} 30%, ${COLORS.platinumDeep} 55%, ${COLORS.platinum} 75%, ${COLORS.platinumLight})`,
            boxShadow: `0 0 60px rgba(185, 225, 255, 0.45)`,
          }}
        >
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              width={480}
              height={640}
              alt=""
              style={{ borderRadius: 24, objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: 480,
                height: 640,
                borderRadius: 24,
                background: COLORS.surface,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 32,
                fontSize: 44,
                textAlign: "center",
                color: COLORS.muted,
              }}
            >
              {piece.name}
            </div>
          )}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={trophy}
          width={200}
          height={200}
          alt=""
          style={{ position: "absolute", right: -90, bottom: -70 }}
        />
      </div>

      <div
        style={{
          fontSize: 40,
          letterSpacing: 10,
          textTransform: "uppercase",
          color: COLORS.platinum,
          fontWeight: 700,
        }}
      >
        ¡Platiné!
      </div>
      <div
        style={{
          marginTop: 16,
          fontSize: piece.name.length > 32 ? 52 : 64,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.1,
          maxWidth: 940,
        }}
      >
        {piece.name}
      </div>
      <div style={{ marginTop: 24, fontSize: 32, color: COLORS.muted }}>
        {details.join("  ·  ")}
      </div>

      <div
        style={{
          marginTop: "auto",
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 30,
          color: COLORS.muted,
        }}
      >
        <span>{profile?.profile_name ?? ""}</span>
        <span style={{ color: COLORS.ink, fontWeight: 700 }}>Platinoob</span>
      </div>
    </div>,
    { ...SIZE, headers: { "Cache-Control": "private, no-store" } },
  );
}
