import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";
import { findCoverUrl } from "@/lib/covers";
import { normalizeName } from "@/lib/catalog/dedup";
import { reconcilePlatinumDiaryEntry } from "@/lib/diary/platinum";
import { endNowPlaying } from "@/lib/now-playing/end";
import { getAuthorizationFromNpsso, getPsnAvatarUrl, getPsnTrophySummary } from "./auth";
import { mapWithConcurrency } from "./concurrency";
import { decryptSecret } from "./crypto";
import { NpssoExpiredError } from "./errors";
import {
  PSN_MOCKS_ENABLED,
  MOCK_EXPIRED_NPSSO,
  getMockTitles,
  getMockPlaytimeByName,
} from "./mocks";
import { fetchPsnPlaytime, playtimeMatchKey, type PsnPlaytimeResult } from "./playtime";
import { fetchUserTitlesWithTrophies, type FetchedTitle } from "./trophies";

export type SyncResult = { titlesSynced: number; trophiesSynced: number };

/** Cuántos títulos se procesan en simultáneo contra la base. */
/**
 * Cuántos nombres se loguean de cada lado cuando el cruce de horas falla. Es
 * un diagnóstico, no un dump: alcanza para ver el patrón sin llenar los logs.
 */
const DIAGNOSTIC_NAME_SAMPLE = 15;

const TITLE_WRITE_CONCURRENCY = 3;

function parseEarnedRate(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Busca un juego `source = 'catalog'` del propio usuario cuyo nombre normalizado
 * coincida con el que trae PSN y lo convierte en el juego sincronizado (mismo
 * `id`, así no se pierden ni las entradas de diario ni el vínculo en
 * `user_games`). Devuelve null si no hay candidato o si la RLS bloquea el
 * update -- en ese caso el caller sigue con el alta normal.
 */
async function adoptCatalogGame(
  supabase: SupabaseClient<Database>,
  userId: string,
  title: FetchedTitle,
  catalogGameIdByName: Map<string, string>,
): Promise<string | null> {
  const matchId = catalogGameIdByName.get(normalizeName(title.name));
  if (!matchId) return null;

  const { data: updated } = await supabase
    .from("games")
    .update({
      np_comm_id: title.npCommId,
      platform: title.platform,
      icon_url: title.iconUrl,
      source: "psn",
    })
    .eq("id", matchId)
    .eq("created_by", userId)
    .select("id")
    .maybeSingle();

  if (updated?.id) {
    // Ya no es un juego de catálogo: sacarlo del mapa evita que un segundo
    // título de PSN con nombre parecido intente adoptar la misma fila.
    catalogGameIdByName.delete(normalizeName(title.name));
    return updated.id;
  }
  return null;
}

async function resolveGameId(
  supabase: SupabaseClient<Database>,
  userId: string,
  title: FetchedTitle,
  catalogGameIdByName: Map<string, string>,
): Promise<string | null> {
  const { data: existingGame } = await supabase
    .from("games")
    .select("id")
    .eq("np_comm_id", title.npCommId)
    .maybeSingle();

  if (existingGame) return existingGame.id;

  // Reconciliación catálogo -> PSN (issue #96): si el usuario ya había cargado
  // este juego desde la búsqueda de catálogo para el diario, se adopta esa fila
  // en vez de crear una segunda. Se acota a filas propias (`created_by`) porque
  // la RLS de `games` solo deja actualizar las del propio usuario.
  const adoptedId = await adoptCatalogGame(supabase, userId, title, catalogGameIdByName);
  if (adoptedId) return adoptedId;

  const coverUrl = await findCoverUrl(title.name);
  const { data: created, error: insertGameError } = await supabase
    .from("games")
    .insert({
      np_comm_id: title.npCommId,
      name: title.name,
      platform: title.platform,
      icon_url: title.iconUrl,
      cover_url: coverUrl,
      created_by: userId,
      source: "psn",
    })
    .select("id")
    .single();

  if (!insertGameError && created) return created.id;

  // Carrera con otro sync insertando el mismo juego -- reintentar la lectura.
  const { data: retryGame } = await supabase
    .from("games")
    .select("id")
    .eq("np_comm_id", title.npCommId)
    .maybeSingle();
  return retryGame?.id ?? null;
}

/**
 * Sincroniza un título completo con el mínimo de round-trips a la base:
 * un select de los trofeos existentes, un upsert en bloque de los que
 * faltan, un select final para mapear ids, y un upsert en bloque de los
 * trofeos ya desbloqueados. Nunca uno por trofeo -- con bibliotecas
 * grandes eso es lo que hacía que el sync superara el timeout de la
 * función serverless.
 */
async function syncTitle(
  supabase: SupabaseClient<Database>,
  userId: string,
  title: FetchedTitle,
  catalogGameIdByName: Map<string, string>,
  playtimeByName: Map<string, number>,
): Promise<{ titleSynced: boolean; trophiesSynced: number }> {
  const gameId = await resolveGameId(supabase, userId, title, catalogGameIdByName);
  if (!gameId) return { titleSynced: false, trophiesSynced: 0 };

  // Las horas vienen de otro endpoint y cruzan por nombre (ver `playtime.ts`):
  // si este título no matcheó, la columna ni se menciona en el upsert, así no
  // se pisa con NULL un valor que ya estaba guardado.
  const playtimeMinutes = playtimeByName.get(playtimeMatchKey(title.name));

  // El error se mira: este upsert falló en silencio durante meses (faltaba la
  // policy de UPDATE en `user_games`, ver
  // 20260901000000_user_games_update_policy.sql) y desde afuera se veía igual
  // que un fallo del cruce por nombre -- horas viejas congeladas y ninguna
  // pista de por qué. No aborta el sync: los trofeos del título valen aunque
  // la fila de biblioteca no se haya podido escribir.
  const { error: userGameError } = await supabase.from("user_games").upsert(
    {
      user_id: userId,
      game_id: gameId,
      last_played_at: title.lastPlayedAt,
      ...(playtimeMinutes !== undefined ? { playtime_minutes: playtimeMinutes } : {}),
    },
    { onConflict: "user_id,game_id" },
  );
  if (userGameError) {
    console.error(`[psn-sync] no se pudo escribir user_games (${title.name}):`, userGameError);
  }

  if (title.groups.length > 0) {
    const groupRows = title.groups.map((group) => ({
      game_id: gameId,
      group_id: group.groupId,
      name: group.name,
      icon_url: group.iconUrl,
      created_by: userId,
    }));
    await supabase.from("trophy_groups").upsert(groupRows, { onConflict: "game_id,group_id" });
  }

  if (title.trophies.length === 0) {
    return { titleSynced: true, trophiesSynced: 0 };
  }

  const rows = title.trophies.map((trophy) => ({
    game_id: gameId,
    trophy_id: String(trophy.npTrophyId),
    name: trophy.name,
    description: trophy.description,
    type: trophy.type,
    icon_url: trophy.iconUrl,
    hidden: trophy.hidden,
    sort_order: trophy.sortOrder,
    trophy_group_id: trophy.groupId,
    rarity: trophy.rarity,
    earned_rate: parseEarnedRate(trophy.earnedRate),
    progress_target: trophy.progressTarget,
    created_by: userId,
  }));

  // ON CONFLICT DO UPDATE (no ignoreDuplicates): permite que un re-sync
  // backfillee columnas nuevas (ej. trophy_group_id) en filas ya sincronizadas
  // por el mismo usuario. Si el juego lo sincronizó otro usuario antes, la
  // policy "trophies_update_own" bloquea la escritura sobre esas filas
  // silenciosamente (RLS), así que no rompe nada -- sus filas quedan tal cual.
  await supabase.from("trophies").upsert(rows, { onConflict: "game_id,trophy_id" });

  const { data: allTrophies } = await supabase
    .from("trophies")
    .select("id, trophy_id")
    .eq("game_id", gameId);

  const trophyIdByNpId = new Map((allTrophies ?? []).map((t) => [t.trophy_id, t.id]));

  const earnedRows = title.trophies
    .filter((t) => t.earned)
    .map((t) => ({
      user_id: userId,
      trophy_id: trophyIdByNpId.get(String(t.npTrophyId)),
      unlocked_at: t.earnedAt,
    }))
    .filter((row): row is { user_id: string; trophy_id: string; unlocked_at: string | null } =>
      Boolean(row.trophy_id),
    );

  if (earnedRows.length > 0) {
    await supabase.from("user_trophies").upsert(earnedRows, { onConflict: "user_id,trophy_id" });
  }

  // Auto-detección de platino para el diario (issue #96). Va en try/catch a
  // propósito: es un extra sobre el sync, si falla no puede tirar abajo la
  // sincronización de trofeos del título.
  const platinum = title.trophies.find((t) => t.type === "platinum" && t.earned && t.earnedAt);
  if (platinum?.earnedAt) {
    try {
      await reconcilePlatinumDiaryEntry(supabase, userId, gameId, platinum.earnedAt);
    } catch (cause) {
      console.error(
        `[psn-sync] no se pudo actualizar el diario por platino (${title.name}):`,
        cause,
      );
    }

    // El platino también saca el juego de "Jugando ahora" (issue #187). Mismo
    // criterio: un extra, con su propio try/catch.
    try {
      const { error } = await endNowPlaying(supabase, userId, gameId, "platinum", {
        achievedAt: platinum.earnedAt,
      });
      if (error) throw new Error(error);
    } catch (cause) {
      console.error(`[psn-sync] no se pudo cerrar "jugando ahora" (${title.name}):`, cause);
    }
  }

  return { titleSynced: true, trophiesSynced: trophyIdByNpId.size };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trae todos los juegos y trofeos reales del usuario desde PSN y los guarda.
 *
 * Las filas de `games`/`trophies` que sincroniza un usuario quedan con
 * created_by = ese usuario (source = 'psn'). Las políticas RLS actuales solo
 * dejan actualizar filas propias, así que si el juego/trofeo ya existe (lo
 * sincronizó otro usuario antes) no se reescribe -- sólo se reutiliza su id.
 * Limitación conocida v1: el catálogo compartido queda "de facto" en manos de
 * quien sincronizó primero cada juego.
 */
export async function syncTrophiesForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SyncResult> {
  // El NPSSO cifrado se lee con service role (issue #130): la columna deja de
  // ser legible para `authenticated`, así un XSS o una extensión no tienen
  // nada que llevarse. Como bypassea RLS, el `userId` tiene que venir de una
  // sesión ya validada (la ruta manual) o del propio cron, nunca del cliente;
  // se revalida acá que sea un uuid antes de filtrar por él. El resto del sync
  // sigue escribiendo con el cliente que se recibe por parámetro.
  if (!UUID_PATTERN.test(userId)) {
    throw new Error("Usuario inválido para sincronizar.");
  }
  const { data: account, error: accountError } = await createServiceClient()
    .from("psn_accounts")
    .select("npsso_encrypted, account_id")
    .eq("user_id", userId)
    .single();

  if (accountError || !account) {
    throw new Error("No hay una cuenta PSN conectada para este usuario.");
  }

  const npsso = decryptSecret(account.npsso_encrypted);

  let titles: FetchedTitle[];
  // Con E2E_MOCKS=1 nunca hay `authorization` real -- Sony bloquea el NPSSO
  // desde IPs de datacenter (CLAUDE.md), así que ni el sync mockeado ni sus
  // callers pueden depender de un objeto de autorización real (avatar/nivel
  // de trofeos de PSN, ver más abajo).
  let authorization: Awaited<ReturnType<typeof getAuthorizationFromNpsso>> | undefined;
  // Se dispara junto con los trofeos y se espera recién al final (ver abajo).
  let playtimePromise: Promise<PsnPlaytimeResult> | undefined;

  if (PSN_MOCKS_ENABLED) {
    if (npsso === MOCK_EXPIRED_NPSSO) {
      await supabase.from("psn_accounts").update({ token_status: "expired" }).eq("user_id", userId);
      throw new NpssoExpiredError();
    }
    titles = getMockTitles();
  } else {
    try {
      authorization = await getAuthorizationFromNpsso(npsso);
      // Las horas salen de otro endpoint y no dependen de los trofeos, así que
      // se piden EN PARALELO con ellos. En serie no llegaban: traer los
      // trofeos es una request por título (cientos), y cuando terminaba ya no
      // quedaba presupuesto -- la función moría en la página 1 de la
      // paginación de horas, sin error, y sólo quedaban grabados los primeros
      // 100 títulos (los más recientes, que es como PSN ordena la lista).
      playtimePromise = fetchPsnPlaytime(authorization, account.account_id).catch((cause) => {
        console.error("[psn-sync] no se pudieron traer las horas jugadas:", cause);
        return { byName: new Map<string, number>(), titlesFetched: 0 };
      });
      titles = await fetchUserTitlesWithTrophies(authorization);
    } catch (cause) {
      await supabase.from("psn_accounts").update({ token_status: "expired" }).eq("user_id", userId);
      if (cause instanceof NpssoExpiredError) throw cause;
      throw new NpssoExpiredError(cause);
    }
  }

  // Juegos que el usuario cargó desde el catálogo (para el diario) y todavía no
  // tienen np_comm_id: se leen una sola vez por sync, no una vez por título.
  const { data: catalogGames } = await supabase
    .from("games")
    .select("id, name")
    .eq("source", "catalog")
    .eq("created_by", userId)
    .is("np_comm_id", null);
  const catalogGameIdByName = new Map(
    (catalogGames ?? []).map((game) => [normalizeName(game.name), game.id] as const),
  );

  // Horas jugadas: una llamada paginada por biblioteca, no una por juego. Es
  // un dato secundario -- si el endpoint falla o cambia (API no oficial), el
  // sync de trofeos tiene que seguir igual.
  let playtimeByName = new Map<string, number>();
  if (PSN_MOCKS_ENABLED) {
    playtimeByName = getMockPlaytimeByName();
  } else if (playtimePromise) {
    // Ya viene corriendo desde antes de los trofeos: acá normalmente no se
    // espera nada, sólo se recoge el resultado.
    const playtime = await playtimePromise;
    playtimeByName = playtime.byName;
    // Resumen sin nombres: si el cruce por nombre falla (remasters, ediciones)
    // o PSN deja de reportar `playDuration`, se ve acá y no hay que adivinar
    // mirando la base.
    const sinHoras = titles.filter((title) => !playtimeByName.has(playtimeMatchKey(title.name)));
    console.info(
      `[psn-sync] horas jugadas: ${playtime.titlesFetched} títulos devueltos por PSN, ${playtimeByName.size} con horas, ` +
        `${titles.length - sinHoras.length}/${titles.length} títulos con trofeos cruzados.`,
    );
    // Los nombres de los dos lados son lo único que explica un fallo de cruce,
    // y se necesitan JUSTO cuando falla una minoría: con el umbral anterior
    // (más de la mitad) este log no salía nunca y había que ir a mirar la base
    // a mano. Se imprimen acotados y son sólo nombres de juegos.
    if (sinHoras.length > 0) {
      const matchedKeys = new Set(
        titles
          .map((title) => playtimeMatchKey(title.name))
          .filter((key) => playtimeByName.has(key)),
      );
      const huerfanas = [...playtimeByName.keys()].filter((key) => !matchedKeys.has(key));
      console.info(
        `[psn-sync] sin cruzar (trofeos, ${sinHoras.length}): ` +
          sinHoras
            .slice(0, DIAGNOSTIC_NAME_SAMPLE)
            .map((t) => t.name)
            .join(" | "),
      );
      console.info(
        `[psn-sync] sin cruzar (juegos jugados, ${huerfanas.length}): ` +
          huerfanas.slice(0, DIAGNOSTIC_NAME_SAMPLE).join(" | "),
      );
    }
  }

  const results = await mapWithConcurrency(titles, TITLE_WRITE_CONCURRENCY, (title) =>
    syncTitle(supabase, userId, title, catalogGameIdByName, playtimeByName),
  );

  // El avatar puede cambiar en PSN sin que el usuario reconecte la cuenta; se
  // refresca acá para no depender de un flujo aparte. Si falla, no aborta el
  // sync -- es un dato secundario, no se pierde nada si queda desactualizado.
  // Bajo mocks no hay `authorization` real: se deja el avatar como está.
  const avatarUrl = authorization
    ? await getPsnAvatarUrl(authorization, account.account_id).catch(() => undefined)
    : undefined;

  // Nivel y totales reales de PSN (no se recalculan desde user_trophies: la
  // biblioteca local puede estar incompleta y daría otro número). Mismo
  // criterio que el avatar: si falla, no aborta el sync.
  const trophySummary = authorization
    ? await getPsnTrophySummary(authorization, account.account_id).catch(() => undefined)
    : undefined;

  await supabase
    .from("psn_accounts")
    .update({
      token_status: "valid",
      last_synced_at: new Date().toISOString(),
      ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
      ...(trophySummary
        ? {
            trophy_level: trophySummary.level,
            trophy_progress: trophySummary.progressPercent,
            trophy_tier: trophySummary.tier,
            earned_platinum: trophySummary.earned.platinum,
            earned_gold: trophySummary.earned.gold,
            earned_silver: trophySummary.earned.silver,
            earned_bronze: trophySummary.earned.bronze,
          }
        : {}),
    })
    .eq("user_id", userId);

  return {
    titlesSynced: results.filter((r) => r.titleSynced).length,
    trophiesSynced: results.reduce((sum, r) => sum + r.trophiesSynced, 0),
  };
}
