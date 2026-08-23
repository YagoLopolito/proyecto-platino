"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Next scrolla al tope al navegar, pero cuando el segmento nuevo comparte
 * layout con el anterior (todas las rutas de `(app)`) a veces considera que
 * el contenido "ya está visible" y deja el scroll donde estaba: si abrías un
 * juego desde el final de la biblioteca, la ficha aparecía scrolleada al pie.
 *
 * Esto fuerza el tope en cada navegación, salvo que sea un back/forward del
 * browser (ahí queremos la restauración nativa de scroll) o que la URL traiga
 * un hash (ancla explícita, ej. `#trofeos`).
 */
export default function ScrollToTop() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isPopNavigation = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      isPopNavigation.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (isPopNavigation.current) {
      isPopNavigation.current = false;
      return;
    }
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [pathname, searchParams]);

  return null;
}
