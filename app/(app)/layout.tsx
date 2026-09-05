import AppHeader from "./AppHeader";
import MobileTabBar from "./MobileTabBar";

/**
 * Layout compartido para las rutas autenticadas (biblioteca, detalle de
 * juego, perfil, configuración, diario). Route group `(app)` -- no agrega
 * segmento a la URL. Cada página sigue validando su propia sesión (redirect a
 * /login si no hay usuario); este layout sólo aporta la nav/header común.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
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
    </div>
  );
}
