import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { formatPlaytime } from "@/lib/playtime";
import { getGamePageBase, getGameTrophyProgress } from "@/lib/game-page/data";
import TrophyList, { type TrophyListGroup } from "./TrophyList";

/**
 * Tab Trofeos (o Logros, en un juego de Steam). Es tu progreso, así que sólo
 * tiene datos si el juego está en tu biblioteca sincronizada: `user_trophies`
 * es privado y la ficha ya no exige `user_games` para abrirse.
 */
export default async function GameTrophiesTab({ params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = await params;
  const [base, progress] = await Promise.all([
    getGamePageBase(gameId),
    getGameTrophyProgress(gameId),
  ]);
  const isSteam = base.source === "steam";
  const noun = isSteam ? "logros" : "trofeos";

  if (!base.isMember) {
    return (
      <TabBody>
        <EmptyState
          icon="trophy"
          title={`Este juego no está en tu biblioteca, así que no hay ${noun} tuyos para mostrar.`}
          description="Los trofeos llegan solos cuando sincronizás tu cuenta de PSN o de Steam."
        />
      </TabBody>
    );
  }

  if (progress.error) {
    return (
      <TabBody>
        <ErrorState message={`No se pudieron cargar los ${noun}: ${progress.error}`} />
      </TabBody>
    );
  }

  if (progress.total === 0) {
    return (
      <TabBody>
        <EmptyState icon="trophy" title={`Todavía no hay ${noun} cargados para este juego.`} />
      </TabBody>
    );
  }

  // Si el juego tiene DLC, PSN trae sus trofeos como grupos aparte del
  // "default" (juego base): se separan para ver el % de cada uno.
  const groupNameById = new Map(progress.groups.map((group) => [group.group_id, group.name]));
  const groupOrder = Array.from(
    new Set(progress.trophies.map((trophy) => trophy.trophy_group_id ?? "default")),
  );
  const groups: TrophyListGroup[] = groupOrder.map((groupId) => ({
    groupId,
    name: groupId === "default" ? "Juego base" : (groupNameById.get(groupId) ?? `DLC ${groupId}`),
    trophies: progress.trophies.filter(
      (trophy) => (trophy.trophy_group_id ?? "default") === groupId,
    ),
  }));

  // La tira de progreso, que antes vivía en el hero de la ficha de trofeos.
  const stats = [
    { label: isSteam ? "Logros" : "Trofeos", value: `${progress.obtainedCount}/${progress.total}` },
    { label: "Completitud", value: `${progress.percent}%` },
    { label: "Horas", value: formatPlaytime(base.playtimeMinutes) },
  ];

  return (
    <TabBody>
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-card border border-border bg-border">
        {stats.map((stat) => (
          <div key={stat.label} className="space-y-0.5 bg-background px-3 py-2.5">
            <dd className="type-stat text-ink">{stat.value ?? "—"}</dd>
            <dt className="type-overline text-ink-faint">{stat.label}</dt>
          </div>
        ))}
      </dl>
      <TrophyList gameId={gameId} groups={groups} showGroups={groupOrder.length > 1} />
    </TabBody>
  );
}

function TabBody({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">{children}</div>;
}
