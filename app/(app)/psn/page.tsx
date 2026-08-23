import { redirect } from "next/navigation";

/**
 * /psn dejó de ser una sección propia cuando apareció la segunda plataforma
 * (ver PRODUCT_SPEC.md 12.5). Queda como redirect porque hay links guardados y
 * porque el middleware ya la tenía en su matcher.
 */
export default function PsnPage() {
  redirect("/configuracion/conexiones");
}
