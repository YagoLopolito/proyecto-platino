import { GridSkeleton } from "@/components/posts/PostSkeletons";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl py-6 sm:px-4">
      <p className="sr-only" role="status">
        Cargando capturas…
      </p>
      <GridSkeleton />
    </div>
  );
}
