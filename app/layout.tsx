import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { PwaRuntime } from "@/components/pwa/PwaRuntime";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/*
 * La serif del contenido editorial: nombre del juego en las fichas y cuerpo de
 * las reseñas del diario (ver el bloque de tipografía de `globals.css`).
 *
 * Newsreader y no una display pura porque tiene que servir para las dos cosas
 * -- títulos grandes y párrafos de lectura --, y por eso se piden también la
 * itálica (una reseña la usa) y el rango de pesos variable.
 */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Platinoob — Trophy Tracker",
  description:
    "Seguí tu progreso de trofeos de PlayStation sincronizado con tu cuenta PSN y organizá guías de desbloqueo por juego.",
  applicationName: "Platinoob",
  // iOS no lee el manifest: la app instalada desde Safari se configura con
  // estos meta. Sin `capable`, abrir el ícono del home screen abre Safari con
  // toda su barra en vez de la app en pantalla completa.
  appleWebApp: {
    capable: true,
    title: "Platinoob",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  // Next sólo emite el `mobile-web-app-capable` moderno; el alias de Apple
  // sigue siendo el que respetan las versiones de iOS que hay dando vueltas,
  // y sin él la app abre con toda la barra de Safari encima.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // `cover` hace que la app instalada pinte debajo del notch y de la barra de
  // gestos; lo que se ancle a un borde compensa con `env(safe-area-inset-*)`
  // (utilidades `pt-safe`/`pb-safe` en globals.css).
  viewportFit: "cover",
  // El color de la barra de estado / de la ventana de la app instalada: el
  // mismo `--chrome` del header, así la barra del sistema y la de la app se
  // leen como una sola franja.
  themeColor: "#050c15",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      {/* min-h-dvh y no min-h-full: en mobile la barra de direcciones aparece y
          desaparece, y `100vh` deja un hueco del alto de esa barra. */}
      <body className="flex min-h-dvh flex-col">
        {children}
        <PwaRuntime />
      </body>
    </html>
  );
}
