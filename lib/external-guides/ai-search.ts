import "server-only";
import { z } from "zod";
import Groq from "groq-sdk";
import { ExternalGuideSourceError } from "./errors";

/** Modelo "compound" de Groq: tiene web search nativo, restringible por dominio vía search_settings. */
const MODEL = "groq/compound-mini";
const ALLOWED_DOMAINS = ["powerpyx.com", "psnprofiles.com", "truetrophies.com"];

const foundLinkSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  source: z.enum(["PowerPyx", "PSNProfiles", "TrueTrophies"]),
});

const foundLinksSchema = z.array(foundLinkSchema).max(10);

export type AiFoundGuideLink = z.infer<typeof foundLinkSchema>;

function getClient(): Groq {
  const apiKey = process.env.AI_PROVIDER_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la variable de entorno AI_PROVIDER_API_KEY.");
  }
  return new Groq({ apiKey });
}

/**
 * Nunca scrapea el HTML de PowerPyx/PSNProfiles/TrueTrophies (ver CLAUDE.md,
 * sección "Guías de desbloqueo"): usa la herramienta de búsqueda web de
 * Claude, acotada a esos dominios, para encontrar la URL de la guía de
 * trofeos del juego y devuelve solo título+link+fuente -- nunca el contenido
 * de la página. Si el modelo no encuentra nada o la respuesta no matchea el
 * schema, devuelve [] en vez de romper el resto del flujo de "poblar enlaces".
 */
export async function findAiCuratedGuideLinks(gameName: string): Promise<AiFoundGuideLink[]> {
  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      search_settings: { include_domains: ALLOWED_DOMAINS },
      messages: [
        {
          role: "system",
          content:
            "Buscás guías de trofeos/logros de un videojuego en PowerPyx, PSNProfiles y TrueTrophies. " +
            "Nunca inventes URLs ni copies contenido de la página: solo devolvé el título de la guía, " +
            "la URL exacta que encontraste por búsqueda web, y la fuente. Si no encontrás nada confiable " +
            "para alguna fuente, omitila. Respondé ÚNICAMENTE con un array JSON, sin texto adicional, " +
            'con el formato [{"title": string, "url": string, "source": "PowerPyx" | "PSNProfiles" | "TrueTrophies"}].',
        },
        {
          role: "user",
          content: `Buscá la guía de trofeos/logros de "${gameName}" en powerpyx.com, psnprofiles.com y truetrophies.com.`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) return [];

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = foundLinksSchema.safeParse(JSON.parse(jsonMatch[0]));
    return parsed.success ? parsed.data : [];
  } catch (cause) {
    throw new ExternalGuideSourceError("búsqueda con IA (PowerPyx/PSNProfiles/TrueTrophies)", cause);
  }
}
