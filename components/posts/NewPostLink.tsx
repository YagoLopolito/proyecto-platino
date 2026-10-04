import Link from "next/link";
import { buttonClassName } from "@/components/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * "Nueva publicación". Es un link (no un botón que abre estado): desde la app
 * se intercepta y abre el compositor en un modal; por URL es una página.
 */
export function NewPostLink({
  gameId,
  label = "Nueva publicación",
}: {
  gameId?: string;
  label?: string;
}) {
  const href = gameId ? `/publicaciones/nueva?juego=${gameId}` : "/publicaciones/nueva";
  return (
    <Link href={href} className={buttonClassName("primary")}>
      <Icon name="plus" className="h-4 w-4" />
      {label}
    </Link>
  );
}
