"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Un único IntersectionObserver para todas las carátulas platinadas de la
 * pantalla (en una biblioteca real son decenas): uno por carátula multiplicaba
 * los callbacks en cada scroll.
 */
let sharedObserver: IntersectionObserver | null = null;

function observer(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  sharedObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (entry.isIntersecting) element.dataset.visible = "";
        else delete element.dataset.visible;
      }
    },
    { rootMargin: "64px" },
  );
  return sharedObserver;
}

/**
 * Contenedor con el reflejo de luz animado (`.platinum-sheen` en
 * `globals.css`). La animación arranca pausada y sólo corre mientras el
 * elemento está en pantalla (`data-visible`): fuera del viewport no gasta
 * nada. El desfase evita que todas las carátulas brillen a la vez.
 */
export function PlatinumSheen({
  children,
  className = "",
  delaySeconds,
}: {
  children: ReactNode;
  className?: string;
  delaySeconds?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Suscripción a un observer del DOM: efecto externo, no estado de React.
  useEffect(() => {
    const element = ref.current;
    const io = observer();
    if (!element) return;
    if (!io) {
      element.dataset.visible = "";
      return;
    }
    io.observe(element);
    return () => io.unobserve(element);
  }, []);

  return (
    <div
      ref={ref}
      className={`platinum-sheen ${className}`}
      style={
        delaySeconds !== undefined
          ? ({ "--platinum-sheen-delay": `${delaySeconds}s` } as React.CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
}
