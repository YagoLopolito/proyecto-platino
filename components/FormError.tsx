export function FormError({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p role="alert" className={`type-meta text-danger ${className}`}>
      {children}
    </p>
  );
}

export function FormSuccess({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p role="status" className={`type-meta text-success ${className}`}>
      {children}
    </p>
  );
}
