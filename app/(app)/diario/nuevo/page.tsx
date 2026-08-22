import { redirect } from "next/navigation";

/**
 * "Marcar como terminado" ahora es un modal dentro de /diario; esta ruta queda
 * solo para no romper links viejos.
 */
export default function NewDiaryEntryPage() {
  redirect("/diario?nuevo=1");
}
