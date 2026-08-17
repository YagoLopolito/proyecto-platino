"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SyncButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function handleClick() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/psn/sync", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setMessage({
          text: body?.error ?? "No se pudo sincronizar.",
          isError: true,
        });
        return;
      }
      const body = await response.json();
      setMessage({
        text: `Sincronizado: ${body.titlesSynced} juegos, ${body.trophiesSynced} trofeos.`,
        isError: false,
      });
      router.refresh();
    } catch {
      setMessage({ text: "No se pudo conectar con el servidor.", isError: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {pending ? "Sincronizando..." : "Sincronizar ahora"}
      </button>
      {message && (
        <p role={message.isError ? "alert" : "status"} className={message.isError ? "text-sm text-red-400" : "text-sm text-green-400"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
