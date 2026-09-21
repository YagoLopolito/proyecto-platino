import { Icon } from "@/components/ui/Icon";

export function ErrorState({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-card border border-danger/40 bg-danger/10 p-4 type-body text-danger"
    >
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
