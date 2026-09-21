"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type AuthActionState } from "./actions";
import { Input, Label } from "@/components/Input";
import { Button } from "@/components/Button";
import { FormError } from "@/components/FormError";
import { AuthBrandMark } from "@/components/AuthBrandMark";

export default function LoginForm({ confirmError }: { confirmError: boolean }) {
  const initialState: AuthActionState = {
    error: confirmError ? "El link de confirmación es inválido o ya expiró." : null,
  };
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4 py-8 sm:py-16">
      <div className="w-full max-w-sm">
        <AuthBrandMark />

        <form
          action={formAction}
          className="w-full space-y-4 rounded-card border border-border bg-surface p-6 sm:p-8"
        >
          <h1 className="type-title">Iniciar sesión</h1>

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
              autoComplete="current-password"
            />
          </div>

          <FormError>{state.error}</FormError>

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Ingresando..." : "Ingresar"}
          </Button>

          <p className="type-meta text-ink-muted">
            ¿No tenés cuenta?{" "}
            <Link href="/registro" className="font-medium text-accent-ink hover:underline">
              Registrate
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
