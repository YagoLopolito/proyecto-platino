import { confirmSignup } from "./actions";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;

  if (!token_hash || !type) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-950 px-4 py-8 sm:py-16 text-zinc-50">
        <p className="text-sm text-red-400">El link de confirmación es inválido.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-950 px-4 py-8 sm:py-16">
      <form
        action={confirmSignup}
        className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center"
      >
        <h1 className="text-xl font-semibold text-zinc-50">Confirmar cuenta</h1>
        <p className="text-sm text-zinc-400">
          Hacé click para terminar de confirmar tu cuenta.
        </p>
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        {next && <input type="hidden" name="next" value={next} />}
        <button
          type="submit"
          className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white"
        >
          Confirmar cuenta
        </button>
      </form>
    </div>
  );
}
