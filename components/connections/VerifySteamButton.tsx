import Link from "next/link";

/**
 * Arranca el flujo de Steam OpenID. Es un link y no un botón con Server Action
 * porque el flujo es una navegación completa: la app manda al usuario a Steam y
 * Steam lo devuelve con un GET al callback.
 */
export default function VerifySteamButton({ label }: { label: string }) {
  return (
    <Link
      href="/api/steam/openid"
      className="inline-block rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
    >
      {label}
    </Link>
  );
}
