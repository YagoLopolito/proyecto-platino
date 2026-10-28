import AppHeader from "./AppHeader";
import MobileTabBar from "./MobileTabBar";
import { UnreadActivityProvider } from "@/components/activity/UnreadActivity";
import { PlatinumProvider } from "@/components/platinum/PlatinumProvider";

/**
 * Layout compartido para las rutas autenticadas (biblioteca, detalle de
 * juego, perfil, configuración, diario). Route group `(app)` -- no agrega
 * segmento a la URL. Cada página sigue validando su propia sesión (redirect a
 * /login si no hay usuario); este layout sólo aporta la nav/header común.
 */
export default function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  /**
   * Slot `@modal`: las publicaciones de la Galería online (detalle y "Nueva
   * publicación") se abren en un modal sobre la pantalla actual cuando se llega
   * navegando dentro de la app, y como página al entrar por URL o recargar.
   */
  modal: React.ReactNode;
}) {
  return (
    <UnreadActivityProvider>
      {/* Preferencias de efectos/sonido, celebración de platinos nuevos y el
          diálogo de compartir un platino: en todas las pantallas. */}
      <PlatinumProvider>
        <div className="flex min-h-full flex-1 flex-col">
          <AppHeader />
          <div className="flex flex-1 flex-col">{children}</div>
          {/*
           * Spacer del alto de la barra inferior: la barra es `fixed`, así que sin
           * esto tapa el final de cualquier página que llegue hasta abajo.
           */}
          <div
            data-testid="tab-bar-spacer"
            className="h-16 shrink-0 pb-safe sm:hidden"
            aria-hidden="true"
          />
          <MobileTabBar />
          {modal}
        </div>
      </PlatinumProvider>
    </UnreadActivityProvider>
  );
}
