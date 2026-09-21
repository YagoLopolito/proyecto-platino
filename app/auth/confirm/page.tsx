import { confirmSignup } from "./actions";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { AuthBrandMark } from "@/components/AuthBrandMark";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;

  if (!token_hash || !type) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background px-4 py-8 text-ink sm:py-16">
        <div className="w-full max-w-sm">
          <AuthBrandMark />
          <ErrorState message="El link de confirmación es inválido." />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4 py-8 sm:py-16">
      <div className="w-full max-w-sm">
        <AuthBrandMark />
        <form
          action={confirmSignup}
          className="w-full space-y-4 rounded-card border border-border bg-surface p-6 text-center sm:p-8"
        >
          <h1 className="type-title">Confirmar cuenta</h1>
          <p className="type-meta text-ink-muted">
            Hacé click para terminar de confirmar tu cuenta.
          </p>
          <input type="hidden" name="token_hash" value={token_hash} />
          <input type="hidden" name="type" value={type} />
          {next && <input type="hidden" name="next" value={next} />}
          <Button type="submit" className="w-full">
            Confirmar cuenta
          </Button>
        </form>
      </div>
    </div>
  );
}
