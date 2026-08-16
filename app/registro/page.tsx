"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "./actions";
import type { AuthActionState } from "@/app/login/actions";

const initialState: AuthActionState = { error: null };

export default function RegistroPage() {
  const [state, formAction, pending] = useActionState(signup, initialState);
  const success = !pending && state.error === null && state !== initialState;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-950 px-4 py-16">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-8"
      >
        <h1 className="text-xl font-semibold text-zinc-50">Crear cuenta</h1>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm text-zinc-400">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm text-zinc-400">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-50"
          />
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-red-400">
            {state.error}
          </p>
        )}

        {success && (
          <p role="status" className="text-sm text-emerald-400">
            Cuenta creada. Revisá tu email para confirmarla antes de iniciar sesión.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Creando cuenta..." : "Crear cuenta"}
        </button>

        <p className="text-sm text-zinc-400">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="text-blue-400 hover:underline">
            Iniciá sesión
          </Link>
        </p>
      </form>
    </div>
  );
}
