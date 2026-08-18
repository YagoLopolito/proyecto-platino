export function FormError({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={`text-sm text-red-400 ${className}`}>
      {children}
    </p>
  );
}

export function FormSuccess({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="status" className={`text-sm text-green-400 ${className}`}>
      {children}
    </p>
  );
}
