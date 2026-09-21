import Link from "next/link";
import { buttonClassName } from "@/components/Button";

/**
 * Arranca el flujo de Steam OpenID. Es un link y no un botón con Server Action
 * porque el flujo es una navegación completa: la app manda al usuario a Steam y
 * Steam lo devuelve con un GET al callback.
 */
export default function VerifySteamButton({ label }: { label: string }) {
  return (
    <Link href="/api/steam/openid" className={buttonClassName("primary")}>
      {label}
    </Link>
  );
}
