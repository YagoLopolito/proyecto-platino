import { LoadingState } from "@/components/LoadingState";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col bg-background px-4 py-8 text-ink sm:py-16">
      <div className="mx-auto w-full max-w-2xl">
        <LoadingState label="Cargando..." />
      </div>
    </div>
  );
}
