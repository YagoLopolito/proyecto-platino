"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Hasta dónde se puede ampliar una foto en el visor. */
export const MAX_ZOOM = 4;
/** El zoom de un doble toque / doble click. */
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 300;
/** Un toque que se mueve más que esto es un arrastre, no un toque. */
const TAP_SLOP_PX = 10;

type View = { s: number; x: number; y: number };

/**
 * Una foto del visor a pantalla completa con zoom: pellizco y doble toque en el
 * celular, rueda del mouse y doble click en escritorio, y arrastre para moverse
 * por la foto ampliada.
 *
 * Sin zoom, el área deja el gesto horizontal al navegador (`touch-action:
 * pan-x`) para que el swipe entre archivos siga siendo el scroll-snap nativo
 * del visor; ampliada, toma todos los gestos (`none`) y el visor bloquea su
 * riel (`onZoomChange`). El pellizco con dos dedos se intercepta a mano con
 * listeners no pasivos: el `pinch-zoom` del navegador ampliaría la página
 * entera, barra y botones incluidos.
 *
 * La transformación vive en refs y se escribe directo en el estilo: re-renderizar
 * React en cada `touchmove` se nota en un celular.
 */
export function ZoomableImage({
  active,
  onZoomChange,
  children,
}: {
  /** Si es el archivo visible: al dejar de serlo vuelve a su tamaño. */
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
  children: ReactNode;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>({ s: 1, x: 0, y: 0 });
  const zoomedRef = useRef(false);
  const onZoomChangeRef = useRef(onZoomChange);
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  useEffect(() => {
    const area = areaRef.current;
    const content = contentRef.current;
    if (!area || !content) return;

    /** Lo que ocupa la foto dentro del área a escala 1 (es `object-contain`). */
    const contentSize = () => {
      const width = area.clientWidth;
      const height = area.clientHeight;
      const img = content.querySelector("img");
      if (!img || !img.naturalWidth || !img.naturalHeight) return { width, height };
      const ratio = img.naturalWidth / img.naturalHeight;
      const w = Math.min(width, height * ratio);
      return { width: w, height: w / ratio };
    };

    /** Sin bordes negros de más: la foto ampliada no se aleja de los lados. */
    const clamp = ({ s, x, y }: View): View => {
      const scale = Math.min(MAX_ZOOM, Math.max(1, s));
      if (scale === 1) return { s: 1, x: 0, y: 0 };
      const size = contentSize();
      const maxX = Math.max(0, (size.width * scale - area.clientWidth) / 2);
      const maxY = Math.max(0, (size.height * scale - area.clientHeight) / 2);
      return {
        s: scale,
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    };

    const apply = (next: View, animate = false) => {
      const view = clamp(next);
      viewRef.current = view;
      content.style.transition = animate ? "transform 200ms ease-out" : "none";
      content.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
      const zoomed = view.s > 1.01;
      area.style.touchAction = zoomed ? "none" : "pan-x";
      area.style.cursor = zoomed ? "grab" : "zoom-in";
      area.dataset.zoomed = String(zoomed);
      if (zoomed !== zoomedRef.current) {
        zoomedRef.current = zoomed;
        onZoomChangeRef.current(zoomed);
      }
    };

    /** Un punto de la pantalla, relativo al centro del área. */
    const fromCenter = (clientX: number, clientY: number) => {
      const rect = area.getBoundingClientRect();
      return {
        px: clientX - rect.left - rect.width / 2,
        py: clientY - rect.top - rect.height / 2,
      };
    };

    /** Cambia la escala dejando quieto lo que está debajo de (px, py). */
    const zoomAt = (scale: number, px: number, py: number, animate = false) => {
      const { s, x, y } = viewRef.current;
      const next = Math.min(MAX_ZOOM, Math.max(1, scale));
      apply({ s: next, x: px - ((px - x) * next) / s, y: py - ((py - y) * next) / s }, animate);
    };

    const toggleAt = (clientX: number, clientY: number) => {
      if (zoomedRef.current) {
        apply({ s: 1, x: 0, y: 0 }, true);
      } else {
        const { px, py } = fromCenter(clientX, clientY);
        zoomAt(DOUBLE_TAP_ZOOM, px, py, true);
      }
    };

    // --- Táctil -----------------------------------------------------------
    let pinch: { dist: number; mx: number; my: number; view: View } | null = null;
    let pan: { cx: number; cy: number; view: View } | null = null;
    let tap: { cx: number; cy: number; at: number; moved: boolean } | null = null;
    let lastTap: { cx: number; cy: number; at: number } | null = null;

    const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const startPinch = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]];
      const { px, py } = fromCenter((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
      pinch = { dist: Math.max(1, distance(a, b)), mx: px, my: py, view: viewRef.current };
      pan = null;
      tap = null;
    };
    const startPan = (touch: Touch) => {
      pan = { cx: touch.clientX, cy: touch.clientY, view: viewRef.current };
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        event.preventDefault();
        startPinch(event.touches);
        return;
      }
      const touch = event.touches[0];
      tap = { cx: touch.clientX, cy: touch.clientY, at: event.timeStamp, moved: false };
      if (zoomedRef.current) startPan(touch);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (pinch && event.touches.length >= 2) {
        if (event.cancelable) event.preventDefault();
        const [a, b] = [event.touches[0], event.touches[1]];
        const { px, py } = fromCenter((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
        const start = pinch.view;
        const s = Math.min(MAX_ZOOM, Math.max(1, (start.s * distance(a, b)) / pinch.dist));
        // El punto de la foto que estaba bajo los dedos sigue bajo los dedos.
        apply({
          s,
          x: px - ((pinch.mx - start.x) * s) / start.s,
          y: py - ((pinch.my - start.y) * s) / start.s,
        });
        return;
      }
      const touch = event.touches[0];
      if (tap && Math.hypot(touch.clientX - tap.cx, touch.clientY - tap.cy) > TAP_SLOP_PX) {
        tap.moved = true;
      }
      if (pan && zoomedRef.current) {
        if (event.cancelable) event.preventDefault();
        apply({
          s: pan.view.s,
          x: pan.view.x + touch.clientX - pan.cx,
          y: pan.view.y + touch.clientY - pan.cy,
        });
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (pinch && event.touches.length < 2) {
        pinch = null;
        // Queda un dedo apoyado: sigue moviendo la foto desde ahí.
        if (event.touches.length === 1 && zoomedRef.current) startPan(event.touches[0]);
        return;
      }
      if (event.touches.length > 0) return;
      pan = null;
      if (!tap || tap.moved || event.timeStamp - tap.at > DOUBLE_TAP_MS) {
        tap = null;
        lastTap = null;
        return;
      }
      const current = { cx: tap.cx, cy: tap.cy, at: event.timeStamp };
      tap = null;
      if (
        lastTap &&
        current.at - lastTap.at < DOUBLE_TAP_MS &&
        Math.hypot(current.cx - lastTap.cx, current.cy - lastTap.cy) < TAP_SLOP_PX * 3
      ) {
        // Sin esto, el navegador emula además un dblclick de mouse.
        if (event.cancelable) event.preventDefault();
        lastTap = null;
        toggleAt(current.cx, current.cy);
      } else {
        lastTap = current;
      }
    };

    // --- Mouse ------------------------------------------------------------
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { px, py } = fromCenter(event.clientX, event.clientY);
      zoomAt(viewRef.current.s * Math.exp(-event.deltaY * 0.0015), px, py);
    };
    const onDblClick = (event: MouseEvent) => toggleAt(event.clientX, event.clientY);

    let drag: { id: number; cx: number; cy: number; view: View } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || !zoomedRef.current) return;
      drag = { id: event.pointerId, cx: event.clientX, cy: event.clientY, view: viewRef.current };
      area.setPointerCapture(event.pointerId);
      area.style.cursor = "grabbing";
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      apply({
        s: drag.view.s,
        x: drag.view.x + event.clientX - drag.cx,
        y: drag.view.y + event.clientY - drag.cy,
      });
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      area.style.cursor = zoomedRef.current ? "grab" : "zoom-in";
    };
    // El <img> es arrastrable por defecto: el arrastre nativo se comería el paneo.
    const onDragStart = (event: DragEvent) => event.preventDefault();

    // Al girar el celular cambian las medidas: se vuelve al tamaño original.
    const observer = new ResizeObserver(() => apply({ s: 1, x: 0, y: 0 }));
    observer.observe(area);

    apply(viewRef.current);
    area.addEventListener("touchstart", onTouchStart, { passive: false });
    area.addEventListener("touchmove", onTouchMove, { passive: false });
    area.addEventListener("touchend", onTouchEnd, { passive: false });
    area.addEventListener("touchcancel", onTouchEnd);
    area.addEventListener("wheel", onWheel, { passive: false });
    area.addEventListener("dblclick", onDblClick);
    area.addEventListener("pointerdown", onPointerDown);
    area.addEventListener("pointermove", onPointerMove);
    area.addEventListener("pointerup", onPointerUp);
    area.addEventListener("pointercancel", onPointerUp);
    area.addEventListener("dragstart", onDragStart);
    return () => {
      observer.disconnect();
      area.removeEventListener("touchstart", onTouchStart);
      area.removeEventListener("touchmove", onTouchMove);
      area.removeEventListener("touchend", onTouchEnd);
      area.removeEventListener("touchcancel", onTouchEnd);
      area.removeEventListener("wheel", onWheel);
      area.removeEventListener("dblclick", onDblClick);
      area.removeEventListener("pointerdown", onPointerDown);
      area.removeEventListener("pointermove", onPointerMove);
      area.removeEventListener("pointerup", onPointerUp);
      area.removeEventListener("pointercancel", onPointerUp);
      area.removeEventListener("dragstart", onDragStart);
    };
  }, []);

  // Al pasar a otro archivo, éste vuelve a su tamaño. Es DOM, no estado.
  useEffect(() => {
    if (active) return;
    const content = contentRef.current;
    const area = areaRef.current;
    if (!content || !area) return;
    viewRef.current = { s: 1, x: 0, y: 0 };
    content.style.transition = "none";
    content.style.transform = "";
    area.style.touchAction = "pan-x";
    area.style.cursor = "zoom-in";
    area.dataset.zoomed = "false";
    if (zoomedRef.current) {
      zoomedRef.current = false;
      onZoomChangeRef.current(false);
    }
  }, [active]);

  return (
    <div
      ref={areaRef}
      data-zoomed="false"
      className="h-full w-full touch-pan-x select-none overflow-hidden"
    >
      <div ref={contentRef} className="h-full w-full will-change-transform">
        {children}
      </div>
    </div>
  );
}
