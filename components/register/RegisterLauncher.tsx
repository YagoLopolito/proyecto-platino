"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import CatalogSearchCombobox from "@/components/diary/CatalogSearchCombobox";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";
import { GameArt } from "@/components/game/GameArt";
import { Modal } from "@/components/Modal";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon, type IconName } from "@/components/ui/Icon";
import { getRegisterContext, startPlaying, type RegisterContext } from "@/lib/now-playing/actions";

/** Una opción del menú de registrar. */
function Option({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: IconName;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-14 w-full items-center gap-3 rounded-card px-3 py-2 text-left transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-hover text-accent-ink">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block type-subtitle text-ink">{title}</span>
          <span className="block type-caption text-ink-faint">{hint}</span>
        </span>
      </button>
    </li>
  );
}

/** Carátula chica para las filas del menú. */
function MiniCover({ url }: { url: string | null }) {
  const placeholder = <span className="block h-full w-full bg-surface-hover" />;
  return (
    <span className="relative block aspect-[3/4] w-12 shrink-0 overflow-hidden rounded-chip border border-border bg-surface">
      {url ? (
        <GameArt src={url} alt="" sizes="48px" className="object-cover" fallback={placeholder} />
      ) : (
        placeholder
      )}
    </span>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center gap-1.5 type-meta text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
    >
      <Icon name="arrow-left" className="h-4 w-4" />
      Volver
    </button>
  );
}

type Step = "menu" | "playing" | "finished" | "done";

/**
 * El contenido del +: las tres acciones de registrar (epic #183, issue #187).
 * Mismo contenido en la hoja de mobile y en el modal de escritorio.
 *
 * 1. "¿Estás jugando X?": el último juego que abriste según el sync, si hay
 *    uno que tenga sentido sugerir (ver `getPlaySuggestion`).
 * 2. Marcar otro juego como jugando: el buscador de biblioteca + catálogo.
 * 3. Registrar un juego terminado: arranca con los que estás jugando a mano,
 *    y debajo el mismo buscador.
 *
 * El contexto (sugerencia y "jugando ahora") se pide al abrir el menú y no en
 * el layout: el + vive en todas las pantallas.
 */
function RegisterOptions({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("menu");
  const [context, setContext] = useState<RegisterContext | null>(null);
  const [markedGameId, setMarkedGameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Pedido a una Server Action (efecto externo): el setState ocurre en el
  // callback de la promesa, no sincrónicamente dentro del effect.
  useEffect(() => {
    let cancelled = false;
    getRegisterContext().then((result) => {
      if (!cancelled) setContext(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestion = context?.status === "ok" ? context.suggestion : null;
  const playing = context?.status === "ok" ? context.playing : [];

  function markPlaying(gameId: string) {
    setError(null);
    startTransition(async () => {
      const result = await startPlaying(gameId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMarkedGameId(gameId);
      setStep("done");
    });
  }

  function openGame(gameId: string) {
    onClose();
    router.push(`/juegos/${gameId}`);
  }

  if (step === "done" && markedGameId) {
    return (
      <div className="space-y-4">
        <p role="status" className="flex items-center gap-2 type-body text-ink">
          <Icon name="check" className="h-5 w-5 text-success" />
          Listo, está en “Jugando ahora”.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => openGame(markedGameId)}>
            Ver ficha del juego
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    );
  }

  if (step === "playing") {
    return (
      <div className="space-y-3">
        <BackButton onClick={() => setStep("menu")} />
        <p className="type-body text-ink-muted">
          Buscá el juego que estás jugando. Si no está en tu biblioteca, lo agregamos desde el
          catálogo.
        </p>
        <CatalogSearchCombobox
          inputId="register-playing-query"
          selectLabel="Estoy jugando este"
          onSelectGame={markPlaying}
        />
        <FormError>{error}</FormError>
      </div>
    );
  }

  if (step === "finished") {
    return (
      <div className="space-y-4">
        <BackButton onClick={() => setStep("menu")} />
        {playing.length > 0 && (
          <section className="space-y-2" aria-labelledby="register-playing-heading">
            <h3 id="register-playing-heading" className="type-overline text-ink-faint">
              Estás jugando
            </h3>
            <ul className="-mx-3 space-y-1">
              {playing.map((game) => (
                <li key={game.id}>
                  <button
                    type="button"
                    onClick={() => openGame(game.id)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-card px-3 py-2 text-left transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
                  >
                    <MiniCover url={game.imageUrl} />
                    <span className="min-w-0">
                      <span className="block truncate type-subtitle text-ink">{game.name}</span>
                      <span className="block type-caption text-ink-faint">
                        Registrarlo como terminado
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="type-body text-ink-muted">
          {playing.length > 0 ? "¿Es otro? Buscalo." : "Buscá el juego que terminaste."} Si no está
          en tu biblioteca, lo agregamos desde el catálogo.
        </p>
        <CatalogSearchCombobox inputId="register-finished-query" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {suggestion && (
        <section
          aria-labelledby="register-suggestion-heading"
          className="flex gap-3 rounded-card border border-border bg-surface p-3"
        >
          <MiniCover url={suggestion.imageUrl} />
          <div className="min-w-0 space-y-2">
            <h3 id="register-suggestion-heading" className="type-subtitle text-ink">
              ¿Estás jugando {suggestion.name}?
            </h3>
            <p className="type-caption text-ink-faint">
              Lo abriste por última vez el{" "}
              {new Date(suggestion.lastPlayedAt).toLocaleDateString("es-AR", {
                day: "numeric",
                month: "long",
              })}
              .
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={pending} onClick={() => markPlaying(suggestion.id)}>
                Sí, lo estoy jugando
              </Button>
              <Button type="button" variant="secondary" onClick={() => setStep("playing")}>
                No, es otro
              </Button>
            </div>
            <FormError>{error}</FormError>
          </div>
        </section>
      )}

      <ul className="-mx-3 space-y-1">
        <Option
          icon="gamepad"
          title="Marcar un juego como jugando"
          hint="Aparece en tu perfil y en la ficha del juego."
          onClick={() => setStep("playing")}
        />
        <Option
          icon="check"
          title="Registrar un juego terminado"
          hint="Con tu puntuación y tu reseña, en el diario."
          onClick={() => setStep("finished")}
        />
      </ul>
    </div>
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
          <RegisterOptions onClose={close} />
        </BottomSheet>
      ) : (
        <Modal open={open} onClose={close} title={TITLE}>
          <RegisterOptions onClose={close} />
        </Modal>
      )}
    </>
  );
}
