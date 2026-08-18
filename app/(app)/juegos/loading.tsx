import { LoadingState } from "@/components/LoadingState";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 px-4 py-16 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl">
        <LoadingState label="Cargando biblioteca..." />
      </div>
    </div>
  );
}
