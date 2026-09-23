import { SectionPlaceholder } from "@/components/SectionPlaceholder";
import { NewListButton } from "@/components/lists/NewListButton";

export const metadata = { title: "Listas" };

/**
 * Biblioteca › Listas. Descubrir listas (de amigos y las armadas con datos)
 * llega con los sub-issues #191 y #192; crear una ya se puede (#189).
 */
export default function BibliotecaListasPage() {
  return (
    <SectionPlaceholder
      icon="list"
      title="Las listas de tus amigos y las armadas con datos van a vivir acá."
      description="Mejor puntuados en Platinoob, platinos más cortos, populares entre tus amigos… Próximamente. Mientras tanto, podés armar las tuyas."
    >
      <div className="flex justify-end">
        <NewListButton />
      </div>
    </SectionPlaceholder>
  );
}
