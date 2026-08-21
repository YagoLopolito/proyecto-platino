"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { explainTrophy } from "./actions";
import { TrophyTypeIcon, type TrophyType } from "@/components/TrophyTypeIcon";

const TYPE_LABEL: Record<string, string> = {
  bronze: "Bronce",
  silver: "Plata",
  gold: "Oro",
  platinum: "Platino",
};

/** 0=ultra rara .. 3=común, tal cual `TrophyRarity` de psn-api. */
const RARITY_LABEL: Record<number, string> = {
  0: "Ultra rara",
  1: "Muy rara",
  2: "Rara",
};

export default function TrophyItem({
  gameId,
  trophyId,
  name,
  description,
  type,
  hidden,
  iconUrl,
  isObtained,
  rarity,
  earnedRate,
  progressTarget,
}: {
  gameId: string;
  trophyId: string;
  name: string;
  description: string | null;
  type: string;
  hidden: boolean;
  iconUrl: string | null;
  isObtained: boolean;
  rarity: number | null;
  earnedRate: number | null;
  progressTarget: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    const willOpen = !open;
    setOpen(willOpen);

    if (willOpen && hint === null && error === null && !pending) {
      const formData = new FormData();
      formData.set("gameId", gameId);
      formData.set("trophyId", trophyId);
      startTransition(async () => {
        const result = await explainTrophy({ hint: null, error: null }, formData);
        setHint(result.hint);
        setError(result.error);
      });
    }
  }

  return (
    <li
      className={`rounded-lg border p-4 ${
        isObtained ? "border-green-800/60 bg-green-950/10" : "border-zinc-800 bg-zinc-900"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {iconUrl ? (
            <Image
              src={iconUrl}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-zinc-800">
              <TrophyTypeIcon type={type as TrophyType} className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">
              {name}
              {hidden && <span className="ml-2 text-xs text-zinc-500">(oculto)</span>}
              {isObtained && <span className="ml-2 text-xs text-green-500">Obtenido ✓</span>}
            </p>
            {description && <p className="truncate text-xs text-zinc-500">{description}</p>}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <TrophyTypeIcon type={type as TrophyType} className="h-3.5 w-3.5" />
                {TYPE_LABEL[type] ?? type}
              </span>
              {rarity !== null && rarity in RARITY_LABEL && (
                <span className="text-amber-500">{RARITY_LABEL[rarity]}</span>
              )}
              {earnedRate !== null && <span>{earnedRate}% lo desbloqueó</span>}
              {progressTarget && <span>Objetivo: {progressTarget}</span>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          className="shrink-0 rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-400 hover:border-blue-500 hover:text-blue-300"
        >
          {open ? "Ocultar ayuda" : "❓ Cómo desbloquearlo"}
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 p-3 text-sm">
          {pending && <p className="text-zinc-500">Generando ayuda...</p>}
          {!pending && error && <p className="text-red-400">{error}</p>}
          {!pending && hint && <p className="leading-relaxed text-zinc-300">{hint}</p>}
        </div>
      )}
    </li>
  );
}
