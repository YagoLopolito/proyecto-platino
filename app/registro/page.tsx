"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "./actions";
import type { AuthActionState } from "@/app/login/actions";
import { Input, Label } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError, FormSuccess } from "@/components/FormError";
import { AuthBrandMark } from "@/components/AuthBrandMark";

const initialState: AuthActionState = { error: null };

export default function RegistroPage() {
  const [state, formAction, pending] = useActionState(signup, initialState);
  const success = !pending && state.error === null && state !== initialState;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-950 px-4 py-8 sm:py-16">
      <div className="w-full max-w-sm">
        <AuthBrandMark />

        <form
          action={formAction}
          className="w-full space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-8"
        >
          <h1 className="text-xl font-semibold text-zinc-50">Crear cuenta</h1>

          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <FormError>{state.error}</FormError>

          {success && (
            <FormSuccess>
              Cuenta creada. Revisá tu email para confirmarla antes de iniciar sesión.
            </FormSuccess>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creando cuenta..." : "Crear cuenta"}
          </Button>

          <p className="text-sm text-zinc-400">
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="text-blue-400 hover:underline">
              Iniciá sesión
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
