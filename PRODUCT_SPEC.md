# Proyecto Platino — Documento maestro (spec + reglas)

Este documento complementa a `CLAUDE.md` (que ya define stack, modelo de datos base y convenciones). Acá se cierran las decisiones que faltaban y se detalla todo lo necesario para que el desarrollo — humano o agentic — no tenga zonas grises. Es el "prompt" de referencia para construir la app.

Decisiones confirmadas con Yago (2026-08-15):
- **Alcance**: multi-usuario desde el día 1 (no una herramienta personal).
- **Guía/advisor**: asistida por IA (LLM), no solo curación manual.
- **Idioma/UI**: español, tema oscuro estilo "gamer" (paleta PlayStation).

---

## 1. Visión y pilares

1. **Trophy tracker**: cada usuario conecta su cuenta PSN y ve su progreso de trofeos (bronce/plata/oro/platino) por juego, % de completitud y estadísticas globales (nivel de trofeos, rareza, ranking).
2. **Guía organizador + advisor con IA**: por juego/trofeo, checklist de desbloqueo con pasos curados y/o enlaces externos, MÁS una capa de IA que analiza la lista de trofeos de un juego (nombres, descripciones, si son missables, si requieren múltiples partidas) y genera:
   - Orden sugerido de objetivos.
   - Qué se puede conseguir en una sola run vs. qué necesita New Game+ o partidas separadas (ej. elecciones morales excluyentes, trofeos de dificultad, online).
   - Alertas de trofeos "missable" (se pueden perder para siempre si no se hacen en cierto momento).
   - Tips generales por juego.
3. **Sync con PSN**: importación automática de trofeos desbloqueados vía `psn-api`, sin carga manual.

## 2. Alcance del MVP

**Dentro de alcance (MVP):**
- Auth propia (Supabase) + vínculo de cuenta PSN vía NPSSO.
- Sync manual y luego automático (cron) de trofeos.
- Vista de perfil y biblioteca de juegos con % completitud y trofeos por juego (iconos oficiales de PSN).
- CRUD simple de guías propias (markdown) por juego, con pasos opcionalmente ligados a un trofeo.
- Checklist de guía cruzada contra trofeos ya sincronizados.
- Enlaces curados a fuentes externas (PowerPyx, PSNProfiles, TrueTrophies, IGN, YouTube).
- **Advisor con IA**: botón "Generar plan" por juego que llama a un LLM server-side con el listado de trofeos (nombres + descripciones + flags de ocultos) y devuelve el análisis descrito en el punto 1.2. El resultado se cachea en base de datos (no se regenera en cada visita).
- Manejo de expiración de NPSSO con aviso de reconexión.

**Fuera de alcance (MVP)** — explícitamente pospuesto para no inflar el primer entregable:
- Scraping automatizado de guías de terceros (solo enlaces).
- Rankings sociales / comparación entre usuarios / amigos.
- Notificaciones push o por email.
- App móvil nativa (solo web responsive).
- Multi-idioma (arranca solo en español; diseño preparado para i18n a futuro).
- Edición colaborativa de guías (por ahora, el autor de una guía es su único editor).

## 3. Arquitectura técnica (extiende `CLAUDE.md`)

```
lib/
  psn/           -> toda llamada a psn-api (nunca directo en componentes/rutas)
  ai/            -> cliente del LLM, prompts, parsing de respuesta, caché
  covers/        -> resolución de carátulas (ver sección 5)
  supabase/      -> clientes server/client, tipados
app/
  api/
    psn/         -> connect, sync
    ai/          -> generar plan de un juego
    guides/      -> CRUD
  (rutas UI)
```

Reglas adicionales:
- Igual que las llamadas a `psn-api`, toda llamada al LLM vive en `lib/ai/`, nunca directo en componentes ni rutas sueltas.
- El advisor de IA es **server-side only**: nunca se expone la API key del proveedor de IA al cliente.
- Las respuestas de IA se guardan versionadas (ver modelo de datos) — si el usuario pide "regenerar", se crea una nueva fila en vez de pisar la anterior, para poder comparar/depurar.

## 4. Advisor con IA — diseño

**Proveedor**: usar la API de Claude (Anthropic) vía server-side, misma familia que este asistente, o alternativamente OpenAI — decisión de implementación libre siempre que quede aislada en `lib/ai/`.

**Input al modelo** (por juego, generado desde datos ya sincronizados de PSN + guías propias si existen):
- Nombre del juego, plataforma.
- Lista completa de trofeos: nombre, descripción, tipo (bronce/plata/oro/platino), si es oculto, si el usuario ya lo tiene.
- Guías propias cargadas para ese juego, si existen (para que la IA las tenga en cuenta y no contradiga contenido curado).

**Output esperado (JSON estructurado, no texto libre)**:
```json
{
  "resumen": "string breve",
  "puede_platinar_en_una_run": true,
  "notas_run_unica": "string",
  "grupos_de_partidas": [
    { "run": 1, "objetivo": "string", "trofeos_relacionados": ["id..."] }
  ],
  "missables": [
    { "trofeo_id": "string", "motivo": "string", "momento_limite": "string" }
  ],
  "orden_sugerido": ["trofeo_id", "..."],
  "tips_generales": ["string", "..."]
}
```
- El backend valida el JSON contra un schema antes de guardarlo (si el modelo devuelve algo inválido, se reintenta una vez y si falla se marca el registro como error y se muestra "no se pudo generar" en la UI, nunca un 500 silencioso).
- Se etiqueta claramente en la UI que las sugerencias son generadas por IA y pueden tener errores ("verificá contra la guía oficial si el trofeo es importante").
- Rate limit: generar el plan es una acción explícita del usuario (botón), no automática en cada carga de página, para controlar costo de tokens.

## 5. Carátulas / imágenes de juegos

- **Fuente primaria**: los iconos que ya devuelve `psn-api` (`trophyTitleIconUrl` a nivel de juego, e íconos por trofeo). Son oficiales, siempre están sincronizados y no requieren API adicional ni claves extra — se usan para el 90% de la UI (biblioteca de juegos, trofeos individuales).
- **Fuente secundaria (opcional, mejora visual)**: para carátulas tipo "box art" más prolijas en la vista de detalle de juego, usar **RAWG API** (gratuita, sin requerir cuenta de Twitch como IGDB) como primera opción; si un juego no aparece en RAWG, hacer fallback a **SteamGridDB** (también gratuita, especializada en artwork). Ambas quedan aisladas en `lib/covers/` con el mismo patrón que `lib/psn/`.
- Cachear la URL resuelta en la tabla `games` (columna `cover_url`) para no volver a pegarle a la API externa en cada carga.
- Esto es una mejora de "nice to have" post-MVP-mínimo; si el tiempo aprieta, la app funciona perfecto solo con los íconos de PSN.

## 6. Modelo de datos — adiciones sobre `CLAUDE.md`

Además de las tablas ya definidas (`users`, `psn_accounts`, `games`, `trophies`, `user_trophies`, `guides`, `guide_steps`, `user_guide_progress`):

- `games.cover_url` — carátula resuelta (RAWG/SteamGridDB), nullable, con fallback al ícono de PSN en el frontend si es null.
- `ai_game_plans` — planes generados por IA por juego (y opcionalmente por usuario, si el plan depende de progreso ya hecho): `id`, `game_id`, `user_id` (nullable si el plan es genérico y compartible entre usuarios), `payload_json` (la estructura de la sección 4), `model` (qué modelo lo generó), `created_at`, `status` (`ok` | `error`).
- Todas las tablas con datos de usuario llevan Row Level Security (RLS) en Supabase: un usuario solo lee/escribe sus propias filas en `psn_accounts`, `user_trophies`, `user_guide_progress`, y sus propios `ai_game_plans` cuando son user-scoped.

## 7. Diseño visual

- **Idioma**: 100% español en la UI (código, nombres de variables y comentarios en inglés como siempre).
- **Tema**: dark mode por defecto (no hay modo claro en el MVP). Paleta inspirada en PlayStation: negros/grises azulados de fondo, acentos en azul PSN, y los 4 colores de trofeo bien diferenciados:
  - Bronce `#CD7F32`, Plata `#C0C0C0`, Oro `#FFD700`, Platino `#B9E1FF` (tono frío característico del platino de PSN, no blanco plano).
- Los íconos de trofeo son protagonistas: en tarjetas de juego, mostrar conteo por tipo con su ícono, no solo números.
- Tipografía: una sans-serif moderna (ej. Inter o similar vía next/font), buen contraste sobre fondo oscuro (WCAG AA mínimo).
- Componentes clave a diseñar primero: tarjeta de juego (cover + barra de progreso + conteo de trofeos), vista de detalle de juego (lista de trofeos + panel del advisor IA), vista de perfil (stats globales, nivel de trofeos, rareza).

## 8. Seguridad y privacidad (refuerza `CLAUDE.md`)

- NPSSO: cifrado en reposo (usar `PSN_TOKEN_ENCRYPTION_KEY`), nunca logueado, nunca en el cliente.
- Ninguna clave de IA ni de cover-art APIs lleva prefijo `NEXT_PUBLIC_`.
- RLS activado en todas las tablas con datos de usuario desde la primera migración (no agregarlo "después").
- Sync programado (cron), no en cada request — respeta rate limits no oficiales de PSN.
- Los enlaces a guías externas se muestran como salida (`target="_blank" rel="noopener noreferrer"`), nunca se scrapea el contenido de esos sitios.

## 9. Variables de entorno (actualiza la lista de `CLAUDE.md`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PSN_TOKEN_ENCRYPTION_KEY=
AI_PROVIDER_API_KEY=
RAWG_API_KEY=
STEAMGRIDDB_API_KEY=
```

## 10. Roadmap MVP → issues

Cada fase abajo se traduce 1:1 en un milestone de GitHub, y cada bullet en un issue.

**Fase 0 — Setup del repo**
- Scaffolding Next.js (App Router) + TypeScript + Tailwind.
- Configurar ESLint/Prettier + reglas de convenciones (`no-explicit-any` salvo boundaries).
- Configurar proyecto Supabase (cloud) y variables de entorno locales (`.env.example`).
- Configurar deploy inicial en Vercel (conectar repo).

**Fase 1 — Auth + esquema base**
- Auth de la app con Supabase (email/password).
- Migraciones: `users`, `psn_accounts`, `games`, `trophies`, `user_trophies`, `guides`, `guide_steps`, `user_guide_progress`, `ai_game_plans`.
- RLS en todas las tablas de usuario.

**Fase 2 — Conexión PSN + sync manual**
- Pantalla para pegar NPSSO con instrucciones paso a paso.
- `lib/psn/` — wrapper de autenticación y refresco de tokens.
- Endpoint de sync manual: trae títulos + trofeos del usuario y los persiste.
- Manejo de errores de NPSSO inválido/vencido con mensaje claro.

**Fase 3 — Vista de perfil y biblioteca**
- Biblioteca de juegos con cover (ícono PSN), % completitud, conteo por tipo de trofeo.
- Vista de detalle de juego con lista de trofeos (desbloqueado/no, oculto/no).
- Vista de perfil con stats globales (nivel de trofeos, rareza, totales).

**Fase 4 — Guías propias (CRUD)**
- CRUD de guías (markdown) por juego.
- Pasos de guía opcionalmente ligados a un `trophy_id`.
- Checklist de pasos completados por el usuario.

**Fase 5 — Checklist cruzada**
- Cruzar `user_guide_progress` con `user_trophies` (marcar automáticamente un paso si el trofeo asociado ya está desbloqueado).

**Fase 6 — Advisor con IA**
- `lib/ai/` — cliente + prompt + validación de schema.
- Endpoint "generar plan" por juego.
- UI del panel de advisor (resumen, missables, orden sugerido, tips).
- Cacheo en `ai_game_plans` + botón "regenerar".

**Fase 7 — Sync automático + expiración de token**
- Cron (Vercel Cron o Supabase Edge Function) de sync periódico.
- Detección de NPSSO vencido + notificación en la UI para reconectar.

**Fase 8 — Carátulas enriquecidas**
- `lib/covers/` — resolución RAWG con fallback SteamGridDB.
- Cacheo de `cover_url` en `games`.

**Fase 9 — Enlaces a guías externas curadas**
- Modelo y UI para asociar links externos (PowerPyx, PSNProfiles, TrueTrophies, IGN, YouTube) a un juego/trofeo, con atribución de fuente visible.

**Fase 10 — Pulido y deploy productivo**
- Revisión de accesibilidad (contraste, foco de teclado).
- Manejo de estados vacíos/loading/error en toda la app.
- QA de flujo completo end-to-end (registro → conexión PSN → sync → guía → advisor IA).

## 11. Definition of Done (por issue)

Un issue se considera terminado cuando:
- El código pasa lint/typecheck sin `any` fuera de boundaries documentados.
- No hay llamadas a `psn-api` fuera de `lib/psn/`, ni al LLM fuera de `lib/ai/`, ni a APIs de covers fuera de `lib/covers/`.
- Las tablas nuevas tienen RLS si contienen datos de usuario.
- Hay al menos un estado de error manejado explícitamente en la UI (no solo el happy path).
- Se probó manualmente el flujo en local con datos reales (o mockeados si la fase es previa a tener sync funcionando).

---

*Este documento vive junto a `CLAUDE.md`. `CLAUDE.md` define las reglas permanentes del proyecto; este spec detalla el plan de ejecución del MVP y las decisiones de producto tomadas el 2026-08-15. Actualizar este archivo cuando cambien decisiones de alcance.*
