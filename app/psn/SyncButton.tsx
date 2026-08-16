"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SyncButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string } | null>(null);

  function handleSync() {
    startTransition(async () => {
      setMessage(null);
      const res = await fetch("/api/psn/sync", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ error: data.error ?? "No se pudo sincronizar." });
        return;
      }

      setMessage({
        success: `Sync completo: ${data.titlesSynced} juegos, ${data.trophiesSynced} trofeos.`,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={isPending}
        className="w-full rounded bg-zinc-800 px-4 py-2 font-medium text-zinc-50 hover:bg-zinc-700 disabled:opacity-50"
      >
        {isPending ? "Sincronizando..." : "Sincronizar ahora"}
      </button>
      {message?.error && <p className="text-sm text-red-400">{message.error}</p>}
      {message?.success && <p className="text-sm text-emerald-400">{message.success}</p>}
    </div>
  );
}
