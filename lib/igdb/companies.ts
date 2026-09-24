import "server-only";
import { igdbImageUrl, igdbQuery, igdbString } from "./client";
import { yearOf } from "./games";
import {
  IGDB_MOCKS_ENABLED,
  mockCompany,
  mockGameCompanies,
  mockGamesByIds,
  mockSearchCompanies,
} from "./mocks";

/**
 * Estudios de IGDB (epic #183, issue #193): desarrolladoras y publishers, con
 * los juegos que hicieron. **Sólo estudios**: IGDB no tiene personas
 * (directores, guionistas) y la decisión del epic es no inventarlas con IA.
 */

export type CompanyRole = "developer" | "publisher" | "porting" | "supporting";

export interface IgdbCompanyRef {
  igdbId: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  roles: CompanyRole[];
}

export interface IgdbCompany {
  igdbId: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  /** ISO 3166-1 numérico, como lo publica IGDB. */
  countryCode: number | null;
  parent: { igdbId: number; name: string; slug: string } | null;
  developedIds: number[];
  publishedIds: number[];
}

export interface IgdbStudioGame {
  igdbId: number;
  name: string;
  coverUrl: string | null;
  year: number | null;
}

/** Mismo contrato de tres estados que el resto de `lib/igdb/`. */
export type IgdbResult<T> =
  { status: "ok"; value: T } | { status: "not_found" } | { status: "unavailable"; reason: string };

const ROLES: CompanyRole[] = ["developer", "publisher", "porting", "supporting"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function idList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((id): id is number => typeof id === "number") : [];
}

/** Los estudios de un juego (`involved_companies`), con su rol. */
export async function fetchGameCompanies(
  igdbGameId: number,
): Promise<IgdbResult<IgdbCompanyRef[]>> {
  if (IGDB_MOCKS_ENABLED) return { status: "ok", value: mockGameCompanies(igdbGameId) };

  try {
    const result = await igdbQuery(
      "involved_companies",
      `fields company.name,company.slug,company.logo.image_id,developer,publisher,porting,supporting; where game = ${igdbGameId}; limit 50;`,
    );
    if ("error" in result) {
      console.error(
        `[igdb] no se pudieron pedir los estudios del juego ${igdbGameId}: ${result.error}`,
      );
      return { status: "unavailable", reason: result.error };
    }

    // Un mismo estudio puede venir en dos filas (desarrolla y porta): se
    // juntan los roles.
    const byId = new Map<number, IgdbCompanyRef>();
    for (const entry of result.rows) {
      const row = asRecord(entry);
      const company = asRecord(row?.company);
      if (!row || !company) continue;
      const { id, name, slug } = company;
      if (typeof id !== "number" || typeof name !== "string" || typeof slug !== "string") continue;
      const roles = ROLES.filter((role) => row[role] === true);
      if (roles.length === 0) continue;
      const current = byId.get(id);
      if (current) {
        current.roles = [...new Set([...current.roles, ...roles])];
      } else {
        byId.set(id, {
          igdbId: id,
          name,
          slug,
          logoUrl: igdbImageUrl(asRecord(company.logo)?.image_id, "logo_med"),
          roles,
        });
      }
    }
    return { status: "ok", value: [...byId.values()] };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error(`[igdb] falló la consulta de estudios del juego ${igdbGameId}: ${reason}`);
    return { status: "unavailable", reason };
  }
}

/** Un estudio con su empresa madre y los ids de lo que desarrolló y publicó. */
export async function fetchCompany(
  where: { slug: string } | { igdbId: number },
): Promise<IgdbResult<IgdbCompany>> {
  if (IGDB_MOCKS_ENABLED) {
    const company = mockCompany(where);
    return company ? { status: "ok", value: company } : { status: "not_found" };
  }

  const filter = "slug" in where ? `slug = ${igdbString(where.slug)}` : `id = ${where.igdbId}`;
  try {
    const result = await igdbQuery(
      "companies",
      `fields name,slug,description,country,logo.image_id,parent.name,parent.slug,developed,published; where ${filter}; limit 1;`,
    );
    if ("error" in result) {
      console.error(`[igdb] no se pudo pedir el estudio (${filter}): ${result.error}`);
      return { status: "unavailable", reason: result.error };
    }
    const row = asRecord(result.rows[0]);
    if (
      !row ||
      typeof row.id !== "number" ||
      typeof row.name !== "string" ||
      typeof row.slug !== "string"
    ) {
      return { status: "not_found" };
    }
    const parent = asRecord(row.parent);
    return {
      status: "ok",
      value: {
        igdbId: row.id,
        name: row.name,
        slug: row.slug,
        logoUrl: igdbImageUrl(asRecord(row.logo)?.image_id, "logo_med"),
        description: typeof row.description === "string" ? row.description : null,
        countryCode: typeof row.country === "number" ? row.country : null,
        parent:
          parent &&
          typeof parent.id === "number" &&
          typeof parent.name === "string" &&
          typeof parent.slug === "string"
            ? { igdbId: parent.id, name: parent.name, slug: parent.slug }
            : null,
        developedIds: idList(row.developed),
        publishedIds: idList(row.published),
      },
    };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error(`[igdb] falló la consulta del estudio (${filter}): ${reason}`);
    return { status: "unavailable", reason };
  }
}

/** Tope de IGDB por consulta. */
const PAGE = 500;

/**
 * Nombre, carátula y año de una lista de juegos. Se descartan los DLC, las
 * expansiones y las versiones (`parent_game` / `version_parent`): la grilla
 * de un estudio es de juegos, no de cada paquete que vendió.
 */
export async function fetchGamesByIds(ids: number[]): Promise<IgdbResult<IgdbStudioGame[]>> {
  if (ids.length === 0) return { status: "ok", value: [] };
  if (IGDB_MOCKS_ENABLED) return { status: "ok", value: mockGamesByIds(ids) };

  const games: IgdbStudioGame[] = [];
  try {
    for (let start = 0; start < ids.length; start += PAGE) {
      const chunk = ids.slice(start, start + PAGE);
      const result = await igdbQuery(
        "games",
        `fields name,cover.image_id,first_release_date; where id = (${chunk.join(",")}) & parent_game = null & version_parent = null; limit ${PAGE};`,
      );
      if ("error" in result) {
        console.error(`[igdb] no se pudieron pedir los juegos del estudio: ${result.error}`);
        return { status: "unavailable", reason: result.error };
      }
      for (const entry of result.rows) {
        const row = asRecord(entry);
        if (!row || typeof row.id !== "number" || typeof row.name !== "string") continue;
        games.push({
          igdbId: row.id,
          name: row.name,
          coverUrl: igdbImageUrl(asRecord(row.cover)?.image_id, "cover_big"),
          year: yearOf(row.first_release_date),
        });
      }
    }
    return { status: "ok", value: games };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error(`[igdb] falló la consulta de juegos del estudio: ${reason}`);
    return { status: "unavailable", reason };
  }
}

export interface IgdbCompanySearchHit {
  igdbId: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  /** Desarrollados + publicados, sin contar dos veces el mismo juego. */
  gameCount: number;
}

/**
 * Estudios por nombre para la búsqueda (issue #194). IGDB no indexa
 * `companies` en su `search`, así que va por `name ~ *"…"*` (contiene, sin
 * distinguir mayúsculas). Los que no tienen ningún juego se descartan: son
 * filas vacías que IGDB guarda para distribuidoras regionales.
 */
export async function searchCompanies(
  query: string,
  limit = 20,
): Promise<IgdbResult<IgdbCompanySearchHit[]>> {
  if (IGDB_MOCKS_ENABLED) return { status: "ok", value: mockSearchCompanies(query) };

  try {
    const result = await igdbQuery(
      "companies",
      `fields name,slug,logo.image_id,developed,published; where name ~ *${igdbString(query)}*; limit ${limit};`,
    );
    if ("error" in result) {
      console.error(`[igdb] no se pudieron buscar estudios: ${result.error}`);
      return { status: "unavailable", reason: result.error };
    }
    const hits: IgdbCompanySearchHit[] = [];
    for (const entry of result.rows) {
      const row = asRecord(entry);
      if (
        !row ||
        typeof row.id !== "number" ||
        typeof row.name !== "string" ||
        typeof row.slug !== "string"
      )
        continue;
      const gameCount = new Set([...idList(row.developed), ...idList(row.published)]).size;
      if (gameCount === 0) continue;
      hits.push({
        igdbId: row.id,
        name: row.name,
        slug: row.slug,
        logoUrl: igdbImageUrl(asRecord(row.logo)?.image_id, "logo_med"),
        gameCount,
      });
    }
    return { status: "ok", value: hits.sort((a, b) => b.gameCount - a.gameCount) };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error(`[igdb] falló la búsqueda de estudios: ${reason}`);
    return { status: "unavailable", reason };
  }
}
