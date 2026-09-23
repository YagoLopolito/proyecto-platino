"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent, type ReactNode, type TouchEvent } from "react";

export type SwipeTab = { href: string; label: string };

/** Cuánto hay que arrastrar (px) para cambiar de tab. Menos, y un scroll torcido cambia de pantalla. */
const SWIPE_THRESHOLD = 64;
/** El gesto tiene que ser claramente horizontal: |dx| > |dy| × este factor. */
const HORIZONTAL_RATIO = 1.5;

/**
 * ¿Arrancó el gesto dentro de algo que ya scrollea en horizontal (un
 * `PosterRow`, una fila de chips)? Ahí el swipe es de ese carrusel, no de las
 * tabs: si no, deslizar una fila de carátulas te cambiaba de pantalla.
 */
function startsInHorizontalScroller(target: EventTarget | null, stop: HTMLElement): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== stop) {
    const overflowX = getComputedStyle(el).overflowX;
    if ((overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Tabs de sub-sección (Biblioteca › Juegos / Reseñas / Listas, Actividad,
 * Perfil). Epic #183, issue #185.
 *
 * - **Cada tab es un link a su ruta**, no estado de React: misma regla que el
 *   filtro `?fuente=` de la biblioteca. Se puede linkear, sobrevive al refresh
 *   y "atrás" funciona.
 * - **En mobile se desliza**: un swipe horizontal sobre el contenido navega a
 *   la tab vecina. `touch-action: pan-y` deja el scroll vertical al navegador
 *   y nos da el horizontal. Sin librerías: son dos listeners de touch.
 * - **Teclado**: patrón de tabs de WAI-ARIA (`tablist` / `tab` /
 *   `aria-selected`, flechas ← → y Inicio/Fin). Como cada tab es una
 *   navegación, la flecha mueve el foco Y navega (activación automática).
 * - El indicador de 2px se desliza de una tab a la otra; con
 *   `prefers-reduced-motion` salta sin animación.
 */
export function SwipeTabs({
  tabs,
  label,
  children,
}: {
  tabs: SwipeTab[];
  /** Nombre accesible de la lista de tabs ("Biblioteca", "Actividad"...). */
  label: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number; ignore: boolean } | null>(null);

  // La tab activa es la de la ruta más larga que matchea: `/biblioteca` no
  // tiene que quedar activa estando en `/biblioteca/resenas`.
  const activeIndex = tabs.reduce((best, tab, index) => {
    const matches = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
    if (!matches) return best;
    return best === -1 || tab.href.length > tabs[best].href.length ? index : best;
  }, -1);

  // Precargar las vecinas: el swipe tiene que sentirse instantáneo. Es un
  // efecto del router (imperativo), no sincronización de estado.
  useEffect(() => {
    for (const index of [activeIndex - 1, activeIndex + 1]) {
      const tab = tabs[index];
      if (tab) router.prefetch(tab.href);
    }
  }, [activeIndex, tabs, router]);

  function goTo(index: number) {
    const tab = tabs[index];
    if (!tab || index === activeIndex) return;
    router.push(tab.href);
    tabRefs.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    goTo(next);
  }

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      ignore:
        event.touches.length > 1 ||
        (panelRef.current !== null && startsInHorizontalScroller(event.target, panelRef.current)),
    };
  }

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || start.ignore || activeIndex === -1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO) return;
    // Dedo hacia la izquierda = tab siguiente, como pasar una página.
    goTo(dx < 0 ? activeIndex + 1 : activeIndex - 1);
  }

  const panelId = `${label.toLowerCase().replace(/\s+/g, "-")}-panel`;

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border bg-background">
        <div
          role="tablist"
          aria-label={label}
          className="relative mx-auto flex w-full max-w-5xl px-4"
        >
          {tabs.map((tab, index) => {
            const selected = index === activeIndex;
            return (
              <Link
                key={tab.href}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                href={tab.href}
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                // Roving tabindex: una sola parada de Tab para toda la lista;
                // adentro se navega con las flechas.
                tabIndex={selected || (activeIndex === -1 && index === 0) ? 0 : -1}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={`relative flex min-h-11 flex-1 items-center justify-center px-2 type-overline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ink sm:mr-6 sm:flex-none sm:px-0 ${
                  selected
                    ? "text-accent-ink sm:after:absolute sm:after:inset-x-0 sm:after:bottom-0 sm:after:h-0.5 sm:after:bg-accent-ink"
                    : "font-medium text-ink-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
          {/*
           * En `sm` las tabs van sin padding lateral (y separadas con margen)
           * para que el texto de la primera quede alineado con el borde del
           * contenido de abajo, no corrido 16px.
           *
           * Indicador que se desliza. Se posiciona en porcentaje del ancho de
           * una tab (en mobile son `flex-1`, todas iguales); en `sm` las tabs
           * miden lo que su texto, así que ahí el indicador pasa a ser una
           * regla por tab (`after:` abajo) y este se oculta.
           */}
          {activeIndex !== -1 && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-4 h-0.5 bg-accent-ink transition-transform duration-200 ease-out motion-reduce:transition-none sm:hidden"
              style={{
                width: `calc((100% - 2rem) / ${tabs.length})`,
                transform: `translateX(${activeIndex * 100}%)`,
              }}
            />
          )}
        </div>
      </div>
      <div
        id={panelId}
        ref={panelRef}
        role="tabpanel"
        aria-label={activeIndex === -1 ? label : tabs[activeIndex].label}
        className="flex flex-1 touch-pan-y flex-col"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
