import { redirect } from "next/navigation";

/** Configuración no tiene home propia: el primer (y único) tab es Conexiones. */
export default function ConfiguracionPage() {
  redirect("/configuracion/conexiones");
}
