import type { ReactNode } from "react";

/**
 * Grilla de carátulas. 3 por fila en mobile, igual que la app de Letterbox: a
 * ese ancho la carátula sigue siendo reconocible de un vistazo y entran tres
 * filas en pantalla.
 */
export function PosterGrid({ children }: { children: ReactNode }) {
  return (
    <ul className="grid grid-cols-3 gap-x-2.5 gap-y-4 min-[520px]:grid-cols-4 sm:grid-cols-5 lg:grid-cols-6">
      {children}
    </ul>
  );
}

/**
 * Carrusel horizontal de carátulas, para secciones donde el orden importa más
 * que ver todo (lo último jugado, recomendados). Scrollea con el dedo y hace
 * snap; el ancho fijo es el que deja ver "media carátula" del borde derecho,
 * que es lo que le dice al usuario que hay más.
 */
export function PosterRow({ children }: { children: ReactNode }) {
  return (
    // `scroll-pl-4` acompaña al `px-4`: sin scroll-padding, el snap del primer
    // ítem se alinea con el borde del scroll-port e ignora el padding, y la
    // fila arrancaba desplazada 16px respecto de la grilla de abajo.
    <ul className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-pl-4 px-4 pb-1 sm:mx-0 sm:scroll-pl-0 sm:px-0">
      {children}
    </ul>
  );
}

/** Un ítem de `PosterRow`: ancho fijo, porque la fila no es una grilla. */
export function PosterRowItem({ children }: { children: ReactNode }) {
  return <li className="w-[26vw] max-w-[132px] shrink-0 snap-start sm:w-28">{children}</li>;
}
