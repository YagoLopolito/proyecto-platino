import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Platinoob — Trophy Tracker";

/**
 * Imagen de preview cuando se comparte el link. Satori (el renderer de
 * `ImageResponse`) no dibuja `<svg>` inline, así que el trofeo va como
 * `<img>` con la misma copa estilizada de `components/TrophyTypeIcon.tsx`
 * embebida en un data URI.
 */
const TROPHY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#b9e1ff"><path d="M6 3h12v2h2a1 1 0 0 1 1 1v1c0 2.5-1.7 4.6-4 5.3-.7 1.6-2.1 2.8-3.8 3.2V18h2.3a1 1 0 0 1 1 1v1H8.5v-1a1 1 0 0 1 1-1H11.8v-2.5c-1.7-.4-3.1-1.6-3.8-3.2C5.7 11.6 4 9.5 4 7V6a1 1 0 0 1 1-1h1V3Zm0 4H5v0c0 1.5.8 2.8 2 3.6V7Zm12 0v3.6c1.2-.8 2-2.1 2-3.6h-1V7h-1Z"/></svg>`;

export default function OpengraphImage() {
  const trophy = `data:image/svg+xml;base64,${Buffer.from(TROPHY_SVG).toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        background: "#09090b",
        color: "#fafafa",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={trophy} width={280} height={280} alt="" />
      <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>Platinoob</div>
      <div style={{ fontSize: 34, color: "#a1a1aa" }}>Trophy Tracker de PlayStation y Steam</div>
    </div>,
    size,
  );
}
