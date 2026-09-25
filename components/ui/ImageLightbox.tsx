"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameArt } from "@/components/game/GameArt";
import { Icon } from "@/components/ui/Icon";

/**
 * Una imagen a pantalla completa: fondo negro, la imagen entera
 * (`object-contain`) y se cierra con la ✕, con Escape o tocando afuera de la
 * imagen. Es un `role="dialog"` modal que bloquea el scroll del body, igual
 * que `Modal`, pero sin marco ni título: lo único que importa es la imagen.
 */
export function FullscreenImage({
  src,
  alt,
  onClose,
  children,
}: {
  src: string;
  alt: string;
  onClose: () => void;
  /** Controles extra abajo (anterior / siguiente de una galería). */
  children?: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Efectos del browser (tecla, scroll, foco), no estado: van en un effect.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // No cerrar también un `Modal` de abajo (la galería de capturas).
        event.stopImmediatePropagation();
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Imagen"}
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 pt-safe pb-safe"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex justify-end p-2">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar imagen"
          className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        >
          <Icon name="close" className="h-6 w-6" />
        </button>
      </div>
      <div
        className="relative flex-1"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <GameArt
          key={src}
          src={src}
          alt={alt}
          sizes="100vw"
          className="object-contain"
          fallback={
            <span className="flex h-full w-full items-center justify-center type-body text-white">
              No se pudo cargar la imagen
            </span>
          }
        />
      </div>
      {children && <div className="p-3">{children}</div>}
    </div>
  );
}

/**
 * Envuelve una imagen (la carátula, el fondo de la ficha) en un botón que la
 * abre a pantalla completa. `children` es lo que se ve en la página; `src` es
 * lo que se abre.
 */
export function ExpandableImage({
  src,
  alt,
  label,
  className,
  children,
}: {
  src: string;
  alt: string;
  /** Nombre accesible del botón: "Ver la carátula de X en pantalla completa". */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={`cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink ${className ?? ""}`}
      >
        {children}
      </button>
      {open && <FullscreenImage src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
