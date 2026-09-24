import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";
import {
  fetchCompany,
  fetchGameCompanies,
  fetchGamesByIds,
  type CompanyRole,
  type IgdbGameLookup,
  type IgdbStudioGame,
} from "@/lib/igdb";
import { countryName } from "./country";

/**
 * Estudios en la base (epic #183, issue #193). `companies` y `game_companies`
 * son catálogo compartido: se leen con cualquier sesión y se escriben **sólo**
 * con service role, mismo criterio que `game_external_guides`.
 *
 * Regla de `lib/time-to-beat/`: un fallo al consultar IGDB **no se cachea**.
 * `companies_checked_at` / `games_checked_at` se escriben sólo cuando IGDB
 * contestó (con datos o con "no lo conozco").
 */

type Client = SupabaseClient<Database>;

export interface GameStudio {
  name: string;
  slug: string;
  role: CompanyRole;
}

/** Cada cuánto se vuelven a pedir los juegos de un estudio. */
const STUDIO_GAMES_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function serviceClientOrNull(): Client | null {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

/** Estudios ya guardados de un juego, desarrolladoras primero. */
export async function getGameStudios(supabase: Client, gameId: string): Promise<GameStudio[]> {
  const { data } = await supabase
    .from("game_companies")
    .select("role, companies (name, slug)")
    .eq("game_id", gameId);
  return sortStudios(
    (data ?? []).flatMap((row) =>
      row.companies
        ? [{ name: row.companies.name, slug: row.companies.slug, role: row.role as CompanyRole }]
        : [],
    ),
  );
}

const ROLE_ORDER: CompanyRole[] = ["developer", "publisher", "porting", "supporting"];

function sortStudios(studios: GameStudio[]): GameStudio[] {
  return [...studios].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name),
  );
}

/**
 * Pide a IGDB los estudios de un juego y los guarda. `igdbGame` es el match
 * que la ficha ya hizo para los tiempos: no se busca el nombre dos veces.
 *
 * `null` = no se pudo consultar (no se escribe `companies_checked_at`); `[]`
 * = IGDB contestó y no hay estudios (sí se escribe).
 */
export async function syncGameCompanies(
  gameId: string,
  igdbGame: IgdbGameLookup,
): Promise<GameStudio[] | null> {
  if (igdbGame.status === "unavailable") return null;
  const writer = serviceClientOrNull();
  if (!writer) return null;

  const checkedAt = new Date().toISOString();
  if (igdbGame.status === "not_found") {
    await writer.from("games").update({ companies_checked_at: checkedAt }).eq("id", gameId);
    return [];
  }

  const involved = await fetchGameCompanies(igdbGame.id);
  if (involved.status !== "ok") {
    // Al menos queda el id de IGDB: la próxima visita no vuelve a buscar el nombre.
    await writer.from("games").update({ igdb_id: igdbGame.id }).eq("id", gameId);
    return null;
  }

  const refs = involved.value;
  if (refs.length > 0) {
    // Upsert por `igdb_id` sin pisar la descripción ni el caché de juegos que
    // haya escrito el perfil del estudio.
    const { error } = await writer.from("companies").upsert(
      refs.map((ref) => ({
        igdb_id: ref.igdbId,
        name: ref.name,
        slug: ref.slug,
        logo_url: ref.logoUrl,
      })),
      { onConflict: "igdb_id" },
    );
    if (error) {
      console.error(`[studios] no se pudieron guardar los estudios de ${gameId}:`, error.message);
      return null;
    }
  }

  const { data: companies } = refs.length
    ? await writer
        .from("companies")
        .select("id, igdb_id")
        .in(
          "igdb_id",
          refs.map((ref) => ref.igdbId),
        )
    : { data: [] as { id: string; igdb_id: number }[] };
  const idByIgdb = new Map((companies ?? []).map((row) => [row.igdb_id, row.id]));

  const links = refs.flatMap((ref) => {
    const companyId = idByIgdb.get(ref.igdbId);
    return companyId ? ref.roles.map((role) => ({ game_id: gameId, company_id: companyId, role })) : [];
  });

  // Se reescriben enteros: si IGDB corrigió un rol, el viejo no queda colgado.
  await writer.from("game_companies").delete().eq("game_id", gameId);
  if (links.length > 0) {
    const { error } = await writer.from("game_companies").insert(links);
    if (error) {
      console.error(`[studios] no se pudieron vincular los estudios de ${gameId}:`, error.message);
      return null;
    }
  }

  await writer
    .from("games")
    .update({ igdb_id: igdbGame.id, companies_checked_at: checkedAt })
    .eq("id", gameId);

  return sortStudios(
    refs.flatMap((ref) => ref.roles.map((role) => ({ name: ref.name, slug: ref.slug, role }))),
  );
}

export interface StudioProfile {
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  country: string | null;
  parent: { name: string; slug: string } | null;
  developed: IgdbStudioGame[];
  published: IgdbStudioGame[];
}

type StudioGamesCache = { developed: IgdbStudioGame[]; published: IgdbStudioGame[] };

function readCache(value: Json | null): StudioGamesCache {
  const record = (value ?? {}) as Partial<StudioGamesCache>;
  return {
    developed: Array.isArray(record.developed) ? record.developed : [],
    published: Array.isArray(record.published) ? record.published : [],
  };
}

/**
 * Perfil de un estudio por slug. La primera visita (o una con el caché de más
 * de 30 días) le pide a IGDB el estudio y sus juegos; si IGDB falla y hay un
 * caché viejo, se muestra el viejo antes que nada.
 *
 * `null` = el estudio no existe (404). `"unavailable"` = no está en la base y
 * IGDB no se pudo consultar.
 */
export async function getStudioProfile(
  supabase: Client,
  slug: string,
): Promise<StudioProfile | null | "unavailable"> {
  const { data: row } = await supabase
    .from("companies")
    .select("igdb_id, name, slug, logo_url, description, country, parent_igdb_id, games_cache, games_checked_at")
    .eq("slug", slug)
    .maybeSingle();

  const fresh =
    row?.games_checked_at != null &&
    Date.now() - new Date(row.games_checked_at).getTime() < STUDIO_GAMES_TTL_MS;

  let profileRow = row;
  if (!fresh) {
    const refreshed = await refreshStudio(row ? { igdbId: row.igdb_id } : { slug });
    if (refreshed === "not_found" && !row) return null;
    if (refreshed === "unavailable" && !row) return "unavailable";
    if (refreshed && typeof refreshed === "object") profileRow = refreshed;
  }
  if (!profileRow) return null;

  const { data: parent } = profileRow.parent_igdb_id
    ? await supabase
        .from("companies")
        .select("name, slug")
        .eq("igdb_id", profileRow.parent_igdb_id)
        .maybeSingle()
    : { data: null };

  const cache = readCache(profileRow.games_cache);
  return {
    name: profileRow.name,
    slug: profileRow.slug,
    logoUrl: profileRow.logo_url,
    description: profileRow.description,
    country: profileRow.country,
    parent: parent ?? null,
    developed: cache.developed,
    published: cache.published,
  };
}

type CompanyRow = {
  igdb_id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  country: string | null;
  parent_igdb_id: number | null;
  games_cache: Json | null;
  games_checked_at: string | null;
};

async function refreshStudio(
  where: { slug: string } | { igdbId: number },
): Promise<CompanyRow | "not_found" | "unavailable"> {
  const writer = serviceClientOrNull();
  if (!writer) return "unavailable";

  const company = await fetchCompany(where);
  if (company.status !== "ok") return company.status;
  const studio = company.value;

  const games = await fetchGamesByIds([...new Set([...studio.developedIds, ...studio.publishedIds])]);
  if (games.status !== "ok") return "unavailable";

  const developedIds = new Set(studio.developedIds);
  const publishedIds = new Set(studio.publishedIds);
  const cache: StudioGamesCache = {
    developed: games.value.filter((game) => developedIds.has(game.igdbId)),
    published: games.value.filter((game) => publishedIds.has(game.igdbId)),
  };

  if (studio.parent) {
    // La madre queda con fila mínima para que "Parte de X" sea un link; su
    // perfil completo se pide la primera vez que alguien lo abre.
    await writer
      .from("companies")
      .upsert(
        { igdb_id: studio.parent.igdbId, name: studio.parent.name, slug: studio.parent.slug },
        { onConflict: "igdb_id", ignoreDuplicates: true },
      );
  }

  const row: CompanyRow = {
    igdb_id: studio.igdbId,
    name: studio.name,
    slug: studio.slug,
    logo_url: studio.logoUrl,
    description: studio.description,
    country: countryName(studio.countryCode),
    parent_igdb_id: studio.parent?.igdbId ?? null,
    games_cache: cache as unknown as Json,
    games_checked_at: new Date().toISOString(),
  };
  const { error } = await writer.from("companies").upsert(row, { onConflict: "igdb_id" });
  if (error) console.error(`[studios] no se pudo guardar el estudio ${studio.slug}:`, error.message);
  return row;
}
