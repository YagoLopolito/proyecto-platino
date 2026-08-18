import { LoadingState } from "@/components/LoadingState";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-4 py-16 text-zinc-50">
      <LoadingState label="Cargando perfil..." />
    </div>
  );
}
