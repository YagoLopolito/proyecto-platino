"use client";

import { useState } from "react";

import CatalogSearchCombobox from "@/components/diary/CatalogSearchCombobox";
import { Modal } from "@/components/Modal";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Una opción del menú de registrar. Las que todavía no existen se muestran
 * deshabilitadas con la aclaración, en vez de esconderlas: así el menú ya
 * tiene la forma final y nadie piensa que el + "no hace nada".
 */
function Option({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: IconName;
  title: string;
  hint: string;
  onClick?: () => void;
}) {
  const disabled = !onClick;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex min-h-14 w-full items-center gap-3 rounded-card px-3 py-2 text-left transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-hover ${
            disabled ? "text-ink-faint" : "text-accent-ink"
          }`}
        >
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className={`block type-subtitle ${disabled ? "text-ink-muted" : "text-ink"}`}>
            {title}
          </span>
          <span className="block type-caption text-ink-faint">{hint}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * El contenido del +: las tres acciones de registrar. Mismo contenido en la
 * hoja de mobile y en el modal de escritorio.
 *
 * "Jugando ahora" es del sub-issue #187; hasta entonces las dos primeras
 * opciones quedan deshabilitadas. "Registrar un juego terminado" ya existe: es
 * el buscador de "Marcar como terminado" del diario, reusado tal cual.
 */
function RegisterOptions() {
  const [step, setStep] = useState<"menu" | "finished">("menu");

  if (step === "finished") {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setStep("menu")}
          className="flex min-h-11 items-center gap-1.5 type-meta text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        >
          <Icon name="arrow-left" className="h-4 w-4" />
          Volver
        </button>
        <p className="type-body text-ink-muted">
          Buscá el juego que terminaste. Si no está en tu biblioteca, lo agregamos desde el
          catálogo.
        </p>
        <CatalogSearchCombobox />
      </div>
    );
  }

  return (
    <ul className="-mx-3 space-y-1">
      <Option
        icon="gamepad"
        title="¿Estás jugando algo?"
        hint="Llega con “Jugando ahora”: te va a sugerir el último juego que abriste."
      />
      <Option icon="plus" title="Marcar un juego como jugando" hint="Llega con “Jugando ahora”." />
      <Option
        icon="check"
        title="Registrar un juego terminado"
        hint="Con tu puntuación y tu reseña, en el diario."
        onClick={() => setStep("finished")}
      />
    </ul>
  );
}

const TITLE = "Registrar";

/**
 * El + de la app (epic #183, issue #185). No navega: abre un diálogo. En la
 * barra inferior de mobile es el botón central y abre una `BottomSheet`; en el
 * header de escritorio es el botón primario "Registrar" y abre un `Modal`.
 * Son dos instancias separadas (una por `variant`), cada una con su estado.
 */
export function RegisterLauncher({ variant }: { variant: "tab" | "header" }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const trigger =
    variant === "tab" ? (
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={TITLE}
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full items-center justify-center text-accent-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ink"
      >
        {/* El único ícono en el color de acción de la barra: es LA acción. */}
        <Icon name="plus-circle" className="h-8 w-8" />
      </button>
    ) : (
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-chip bg-accent px-3 type-meta font-semibold text-white transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
      >
        <Icon name="plus" className="h-4 w-4" />
        {TITLE}
      </button>
    );

  return (
    <>
      {trigger}
      {variant === "tab" ? (
        <BottomSheet open={open} onClose={close} title={TITLE}>
          <RegisterOptions />
        </BottomSheet>
      ) : (
        <Modal open={open} onClose={close} title={TITLE}>
          <RegisterOptions />
        </Modal>
      )}
    </>
  );
}
