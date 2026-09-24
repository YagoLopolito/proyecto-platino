import Link from "next/link";
import { buttonClassName } from "@/components/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * "Nueva lista" (epic #183, issue #189): en escritorio es un botón en la
 * cabecera de la sección; en mobile, un botón flotante sobre la barra
 * inferior, como el de Letterboxd. Los dos llevan a la misma ruta.
 */
export function NewListButton() {
  return (
    <>
      {/* El `hidden` va en un envoltorio: puesto en el link, pierde contra el
          `inline-flex` de `buttonClassName` y el botón aparecía también en mobile. */}
      <span className="hidden sm:contents">
        <Link href="/listas/nueva" className={buttonClassName("primary")}>
          <Icon name="plus" className="h-4 w-4" />
          Nueva lista
        </Link>
      </span>
      <Link
        href="/listas/nueva"
        aria-label="Nueva lista"
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:hidden"
      >
        <Icon name="plus" className="h-6 w-6" />
      </Link>
    </>
  );
}
