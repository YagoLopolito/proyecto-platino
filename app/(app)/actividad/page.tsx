import { SectionPlaceholder } from "@/components/SectionPlaceholder";

export const metadata = { title: "Actividad" };

/** Actividad › Amigos. Llega con el sub-issue #195. */
export default function ActividadAmigosPage() {
  return (
    <SectionPlaceholder
      icon="users"
      title="Acá vas a ver las reseñas que escriben tus amigos, a medida que las publican."
      description="Mientras tanto, las últimas están en Biblioteca › Reseñas."
    />
  );
}
