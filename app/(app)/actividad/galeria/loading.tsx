import { FeedSkeleton } from "@/components/posts/PostSkeletons";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col bg-background py-6 sm:px-4 sm:py-10">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <p className="sr-only" role="status">
          Cargando la galería…
        </p>
        <FeedSkeleton />
      </div>
    </div>
  );
}
