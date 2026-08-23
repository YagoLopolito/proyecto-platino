import { Suspense } from "react";
import AppHeader from "./AppHeader";
import ScrollToTop from "./ScrollToTop";

/**
 * Layout compartido para las rutas autenticadas (biblioteca, detalle de
 * juego, perfil, PSN). Route group `(app)` -- no agrega segmento a la URL.
 * Cada página sigue validando su propia sesión (redirect a /login si no hay
 * usuario); este layout sólo aporta la nav/header común.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* useSearchParams necesita un Suspense boundary para no forzar
          renderizado dinámico de todo el layout. */}
      <Suspense fallback={null}>
        <ScrollToTop />
      </Suspense>
      <AppHeader />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
