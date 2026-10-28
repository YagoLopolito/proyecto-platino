import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";
import { findCoverUrl } from "@/lib/covers";
import { normalizeName } from "@/lib/catalog/dedup";
import { reconcilePlatinumDiaryEntry } from "@/lib/diary/platinum";
import { endNowPlaying } from "@/lib/now-playing/end";
import { shouldCelebratePlatinum } from "@/lib/platinum/celebration";
import { getAuthorizationFromNpsso, getPsnAvatarUrl, getPsnTrophySummary } from "./auth";
import { mapWithConcurrency } from "./concurrency";
import { decryptSecret } from "./crypto";
import { NpssoExpiredError, PsnAccountMissingError } from "./errors";
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
 * `user_games`). Devuelve null si no hay candidato -- en ese caso el caller
 * sigue con el alta normal. Escribe con service role (el catálogo ya no es
 * escribible por `authenticated`, issue #164), así que el filtro por
 * `created_by` es lo único que impide adoptar la fila de otro usuario.
 */
async function adoptCatalogGame(
  catalog: SupabaseClient<Database>,
  userId: string,
  title: FetchedTitle,
  catalogGameIdByName: Map<string, string>,
): Promise<string | null> {
  const matchId = catalogGameIdByName.get(normalizeName(title.name));
  if (!matchId) return null;

  const { data: updated } = await catalog
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

/**
 * `isOwner`: el juego lo dio de alta este usuario. Sólo ese sync reescribe las
 * filas compartidas de trofeos y grupos (ver `syncTitle`).
 */
type ResolvedGame = { id: string; isOwner: boolean };

async function resolveGameId(
  catalog: SupabaseClient<Database>,
  userId: string,
  title: FetchedTitle,
  catalogGameIdByName: Map<string, string>,
): Promise<ResolvedGame | null> {
  const { data: existingGame } = await catalog
    .from("games")
    .select("id, created_by")
    .eq("np_comm_id", title.npCommId)
    .maybeSingle();

  if (existingGame) {
    return { id: existingGame.id, isOwner: existingGame.created_by === userId };
  }

  // Reconciliación catálogo -> PSN (issue #96): si el usuario ya había cargado
  // este juego desde la búsqueda de catálogo para el diario, se adopta esa fila
  // en vez de crear una segunda. Se acota a filas propias (`created_by`).
  const adoptedId = await adoptCatalogGame(catalog, userId, title, catalogGameIdByName);
  if (adoptedId) return { id: adoptedId, isOwner: true };

  const coverUrl = await findCoverUrl(title.name);
  const { data: created, error: insertGameError } = await catalog
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

  if (!insertGameError && created) return { id: created.id, isOwner: true };

  // Carrera con otro sync insertando el mismo juego -- reintentar la lectura.
  const { data: retryGame } = await catalog
    .from("games")
    .select("id, created_by")
    .eq("np_comm_id", title.npCommId)
    .maybeSingle();
  return retryGame ? { id: retryGame.id, isOwner: retryGame.created_by === userId } : null;
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
  catalog: SupabaseClient<Database>,
  userId: string,
  title: FetchedTitle,
  catalogGameIdByName: Map<string, string>,
  playtimeByName: Map<string, number>,
  hadPreviousSync: boolean,
): Promise<{ titleSynced: boolean; trophiesSynced: number }> {
  const game = await resolveGameId(catalog, userId, title, catalogGameIdByName);
  if (!game) return { titleSynced: false, trophiesSynced: 0 };
  const gameId = game.id;
  // PSN devuelve nombres y descripciones en el idioma de cada cuenta: si
  // cualquier sync pisara las filas compartidas, la lista de trofeos cambiaría
  // de idioma según quién sincronizó último. Sólo el sync de quien dio de alta
  // el juego las actualiza; los demás sólo agregan lo que falta (un DLC nuevo).
  const sharedWrite = { ignoreDuplicates: !game.isOwner };

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
    await catalog
      .from("trophy_groups")
      .upsert(groupRows, { onConflict: "game_id,group_id", ...sharedWrite });
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

  // Para el dueño del juego es ON CONFLICT DO UPDATE: un re-sync backfillea
  // columnas nuevas (ej. trophy_group_id) y refresca la rareza. Para el resto,
  // DO NOTHING (ver `sharedWrite` arriba). Va con service role (issue #164):
  // `authenticated` ya no escribe el catálogo.
  await catalog.from("trophies").upsert(rows, { onConflict: "game_id,trophy_id", ...sharedWrite });

  const { data: allTrophies } = await catalog
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

  const platinum = title.trophies.find((t) => t.type === "platinum" && t.earned && t.earnedAt);
  const platinumTrophyId = platinum ? trophyIdByNpId.get(String(platinum.npTrophyId)) : undefined;

  // ¿El platino es nuevo? Se mira ANTES del upsert: después ya no se puede
  // distinguir una fila recién creada de una que estaba. Una consulta más sólo
  // en los títulos con platino, no en todos.
  let platinumWasKnown = true;
  if (platinumTrophyId && hadPreviousSync) {
    const { data: known } = await supabase
      .from("user_trophies")
      .select("id")
      .eq("user_id", userId)
      .eq("trophy_id", platinumTrophyId)
      .maybeSingle();
    platinumWasKnown = known !== null;
  }

  if (earnedRows.length > 0) {
    await supabase.from("user_trophies").upsert(earnedRows, { onConflict: "user_id,trophy_id" });
  }

  // Celebración de pantalla completa: `celebrated_at` nace en `now()` y sólo un
  // platino nuevo y reciente queda en NULL (ver `shouldCelebratePlatinum`).
  // Mismo criterio que el diario: un extra que no puede tirar abajo el sync.
  if (
    platinumTrophyId &&
    shouldCelebratePlatinum({
      alreadyHad: platinumWasKnown,
      hadPreviousSync,
      earnedAt: platinum?.earnedAt ?? null,
    })
  ) {
    const { error } = await supabase
      .from("user_trophies")
      .update({ celebrated_at: null })
      .eq("user_id", userId)
      .eq("trophy_id", platinumTrophyId);
    if (error) {
      console.error(
        `[psn-sync] no se pudo marcar el platino para celebrar (${title.name}):`,
        error,
      );
    }
  }

  // Auto-detección de platino para el diario (issue #96). Va en try/catch a
  // propósito: es un extra sobre el sync, si falla no puede tirar abajo la
  // sincronización de trofeos del título.
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
 * `games`, `trophies` y `trophy_groups` son catálogo compartido y desde el
 * issue #164 `authenticated` no los puede editar ni borrar (un usuario
 * cualquiera podía renombrar o borrar, con cascada, lo que veían todos): el
 * sync los escribe con service role. Lo que es del usuario (`user_games`,
 * `user_trophies`, diario, cuenta) sigue yendo con el cliente que se recibe.
 */
export async function syncTrophiesForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SyncResult> {
  // El NPSSO cifrado se lee con service role (issue #130): la columna deja de
  // ser legible para `authenticated`, así un XSS o una extensión no tienen
  // nada que llevarse. Como bypassea RLS, el `userId` tiene que venir de una
  // sesión ya validada (la ruta manual) o del propio cron, nunca del cliente;
  // se revalida acá que sea un uuid antes de filtrar por él. El mismo cliente
  // escribe el catálogo compartido (ver arriba); lo del usuario sigue yendo
  // con el que se recibe por parámetro.
  if (!UUID_PATTERN.test(userId)) {
    throw new Error("Usuario inválido para sincronizar.");
  }
  const catalog = createServiceClient();
  const { data: account, error: accountError } = await catalog
    .from("psn_accounts")
    .select("npsso_encrypted, account_id, last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (accountError) throw accountError;
  if (!account) throw new PsnAccountMissingError();

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
    syncTitle(
      supabase,
      catalog,
      userId,
      title,
      catalogGameIdByName,
      playtimeByName,
      // El primer sync trae la historia entera: nada de eso se celebra.
      account.last_synced_at !== null,
    ),
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
