import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";

export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-4 py-16 text-zinc-50">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-8">
        <h1 className="text-xl font-semibold">Perfil</h1>
        <p className="text-sm text-zinc-400">Sesión iniciada como:</p>
        <p className="font-mono text-sm">{user.email}</p>
        {/*
          La integración con PSN se sacó del proyecto; el código está en el
          historial de git. Ver CLAUDE.md antes de retomarla.
        */}
        <p className="text-xs text-zinc-500">
          La sincronización con PlayStation Network todavía no está disponible.
        </p>
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded bg-zinc-800 px-4 py-2 font-medium text-zinc-50 hover:bg-zinc-700"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
