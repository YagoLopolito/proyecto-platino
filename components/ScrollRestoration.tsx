"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/*
 * El navegador restaura solo la posición de scroll en navegaciones por History
 * API (`history.scrollRestoration` por defecto es "auto"), y eso incluye los
 * `pushState` que hace el router de Next -- por eso entrar a la ficha de un
 * juego podía aparecer scrolleado a la altura de la pantalla anterior. Se
 * apaga la restauración nativa y se fuerza el scroll a 0 en cada navegación,
 * salvo que la propia página pida lo contrario (anclas `#` o un `?resena=`
 * que ya hace su propio `scrollIntoView`, ver `review-focus.ts`/`focusTrophy.ts`).
 */
export function ScrollRestoration() {
  const pathname = usePathname();

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
