export function ErrorState({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-card border border-danger/40 bg-danger/10 p-4 type-body text-danger"
    >
      {message}
    </p>
  );
}
