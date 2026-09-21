import { LoadingState } from "@/components/LoadingState";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-8 text-ink sm:py-16">
      <LoadingState label="Cargando perfil..." />
    </div>
  );
}
