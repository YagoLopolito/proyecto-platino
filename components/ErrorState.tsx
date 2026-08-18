export function ErrorState({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-400">
      {message}
    </p>
  );
}
