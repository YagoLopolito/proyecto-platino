import { SectionPlaceholder } from "@/components/SectionPlaceholder";

export const metadata = { title: "Recibido" };

/** Actividad › Recibido. Llega con los likes (#190) y la actividad (#195). */
export default function ActividadRecibidoPage() {
  return (
    <SectionPlaceholder
      icon="star"
      title="Cuando a alguien le guste una reseña o una lista tuya, lo vas a ver acá."
      description="Próximamente."
    />
  );
}
