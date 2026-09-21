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

Remake completo en el issue #176 (2026-09, seis fases). La referencia es **la app de
Letterboxd**: se copia la estructura (el póster como unidad, versalitas sobre hairline, tiras
de stats, serif para lo editorial), no sus colores. `CLAUDE.md` § "Diseño visual" tiene el
detalle por fase; acá va lo que define el producto.

- **Idioma**: 100% español en la UI (código, nombres de variables y comentarios en inglés como siempre).
- **Tema**: dark mode únicamente, sin modo claro ni dependencia de `prefers-color-scheme`.
- **Tokens, no paleta de Tailwind.** `app/globals.css` es la única fuente de verdad, con pocos
  escalones y un rol explícito cada uno:
  - Superficies (3 + fondo): `background` / `surface` / `surface-raised` / `surface-hover`,
    negros azulados.
  - Tinta (3): `ink` / `ink-muted` / `ink-faint`.
  - Hairlines (2): `border` (separar) / `border-strong` (bordes de controles, ≥3:1).
  - Acentos: `accent` (azul PSN como relleno), `accent-ink` (el mismo azul como texto o ícono
    sobre superficie oscura — son dos tokens porque tienen umbrales de contraste opuestos),
    `accent-hover`, `accent-2` (rosa ○, sólo display y rellenos).
  - Semánticos: `success` (100% / logro obtenido / conexión sana), `warning`, `danger`.
  - Trofeos: Bronce `#CD7F32`, Plata `#C0C0C0`, Oro `#FFD700`, Platino `#B9E1FF` (tono frío
    característico del platino de PSN, no blanco plano), más `trophy-neutral` para el
    `achievement` de Steam, que es "sin desglose" y no un quinto color.
  - Rareza (3 + 1): `rarity-ultra` / `rarity-very` / `rarity-rare`; "común" va con `ink-muted`.
  - Radios (3): `rounded-chip`, `rounded-card`, `rounded-full` (sólo avatares).
  - **Regla no negociable: ningún componente usa un color literal de Tailwind** (`zinc-*`,
    `blue-*`, `emerald-*`…). La hace cumplir ESLint en CI
    (`eslint-rules/no-tailwind-literal-colors.mjs`). Si falta un color, se agrega como token
    con su rol.
- **Tipografía: dos familias con roles.** Geist (sans) para el chrome — nav, botones,
  metadatos, números de stats, versalitas — y Newsreader (serif) para el contenido editorial:
  nombre del juego en las fichas y cuerpo de las reseñas del diario. La escala es semántica
  (`type-display`, `type-title`, `type-subtitle`, `type-body`, `type-review`, `type-meta`,
  `type-caption`, `type-overline`, `type-stat`) y se elige por el rol del texto, nunca
  combinando `text-sm font-semibold` a mano. Contraste AA mínimo, auditado por token contra las
  cuatro superficies en `ACCESSIBILITY.md`.
- **Iconografía: set SVG propio** (`components/ui/Icon.tsx`, 24×24, `currentColor`), nunca
  emojis: se dibujan distinto en cada sistema y no toman el color del tema. Los íconos de
  trofeo por tipo (`TrophyTypeIcon`) siguen aparte porque lo que los distingue es su color
  canónico. Las plataformas van con un gamepad y un monitor genéricos, no con logos de
  PlayStation ni Steam (marcas registradas).
- **Estructura**: la carátula es la unidad (`GamePoster`, 3:4, con sólo la barra de progreso y
  el badge de platino / 100% encima; los números viven en la ficha); las pantallas de navegar
  son grillas de pósters (`PosterGrid`, 3 columnas en mobile); los títulos de sección son
  versalitas sobre hairline (`SectionHeader`); las listas largas (trofeos, entradas de diario,
  feed de amigos) son filas separadas por hairline, no tarjetas apiladas.
- **Anchos de contenedor, dos**: `max-w-5xl` para listados y fichas (biblioteca, diario,
  perfil, ficha de juego, header) y `max-w-2xl` para formularios (Configuración; auth va en
  `max-w-sm` dentro de la misma familia).
- **Mobile primero**: navegación por barra inferior de tabs debajo de `sm`, header con la nav
  en escritorio; la app es instalable como PWA (ver `CLAUDE.md`).

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
STEAM_API_KEY=
CRON_SECRET=
```

`STEAM_API_KEY` hoy solo la usa `lib/external-guides/steam.ts`; con la conexión de
Steam (sección 12) pasa a ser la credencial del sync de logros, y ahí deja de ser
opcional para ese pilar. Es una key **de la app**, no del usuario: Steam no tiene
equivalente al NPSSO, así que no hay secreto por usuario que cifrar.

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

**Fase 13 — Steam como segunda plataforma** (post-MVP, ver sección 12)
- `lib/steam/` — cliente de la Steam Web API (perfil, juegos, logros, rareza).
- Migración `steam_accounts` + `games.steam_appid` + `source = 'steam'`.
- `/configuracion/conexiones`: reemplaza a `/psn` como lugar para conectar cuentas, con PSN y Steam uno al lado del otro.
- Sync manual y luego automático de logros de Steam (misma ruta de cron que PSN).
- Filtro de fuente en la biblioteca (Todos / PSN / Steam).

## 11. Definition of Done (por issue)

Un issue se considera terminado cuando:
- El código pasa lint/typecheck sin `any` fuera de boundaries documentados.
- No hay llamadas a `psn-api` fuera de `lib/psn/`, ni al LLM fuera de `lib/ai/`, ni a APIs de covers fuera de `lib/covers/`.
- Las tablas nuevas tienen RLS si contienen datos de usuario.
- Hay al menos un estado de error manejado explícitamente en la UI (no solo el happy path).
- Se probó manualmente el flujo en local con datos reales (o mockeados si la fase es previa a tener sync funcionando).

---

## 12. Steam como segunda plataforma (decidido 2026-08-23)

> **Estado**: fase completa (issues #110-#119). Todo lo de esta sección está implementado:
> modelo de datos (12.3), `lib/steam/` (12.2), conectar/desconectar y verificar con OpenID,
> `/api/steam/sync` y el cron compartido (12.6), filtro por fuente y stats separadas (12.4)
> y Configuración › Conexiones (12.5).

Objetivo: **la misma conexión que hoy hay con PSN, pero para Steam**. Un usuario puede tener
una de las dos, las dos, o ninguna, y la app se comporta igual en todos los casos.

### 12.1 Por qué Steam es más fácil que PSN (y en qué es más difícil)

Al revés que Sony, **Steam sí tiene una Web API oficial y documentada**, con key gratis en
`steamcommunity.com/dev/apikey` — es la misma `STEAM_API_KEY` que ya usa
`lib/external-guides/steam.ts`. Endpoints que cubren el pilar de tracking:

| Qué | Endpoint |
| --- | --- |
| Resolver un perfil desde su URL personalizada | `ISteamUser/ResolveVanityURL` |
| Nombre y avatar de la cuenta | `ISteamUser/GetPlayerSummaries` |
| Juegos que tiene y horas jugadas | `IPlayerService/GetOwnedGames` (con `include_appinfo=1`) |
| Logros del usuario en un juego | `ISteamUserStats/GetPlayerAchievements` |
| Catálogo de logros (nombre, descripción, ícono, ocultos) | `ISteamUserStats/GetSchemaForGame` |
| Rareza (% global de cada logro) | `ISteamUserStats/GetGlobalAchievementPercentagesForApp` |

Diferencias que sí complican, y que hay que resolver antes de escribir código:

- **No hay secreto por usuario.** La key es de la app; el usuario solo aporta su SteamID64.
  No hay nada que cifrar (adiós al equivalente de `PSN_TOKEN_ENCRYPTION_KEY`) y **nada que
  expire**: el modo de falla no es "token vencido" sino "perfil en privado".
- **El perfil tiene que ser público.** Con "Detalles del juego" en privado, `GetOwnedGames` y
  `GetPlayerAchievements` devuelven vacío aunque la key sea válida. Ese es el estado a mostrar
  en la UI, con instrucciones para cambiarlo, igual que hoy se avisa el NPSSO vencido.
- **Cualquiera puede escribir cualquier SteamID.** Si solo se confía en lo que el usuario tipea,
  se puede "conectar" el perfil de otro. Para el MVP de la fase alcanza (el diario ya es público
  y no se expone nada privado), pero la forma correcta de verificarlo es
  **Steam OpenID** ("Sign in through Steam", gratis, sin key): loguearse ahí devuelve el
  SteamID64 verificado. Decisión: arrancar por SteamID/vanity tipeado y dejar OpenID como
  siguiente paso, marcando la cuenta como no verificada mientras tanto.
- **Steam no tiene platino ni tipos de logro.** Los logros son planos: no hay bronce/plata/oro,
  no hay nivel de trofeos, no hay rareza por tipo. La UI de trofeos tiene que degradar:
  un juego de Steam muestra `X/Y logros` y su porcentaje, sin desglose por tipo ni badge de
  platino. El equivalente al platino es el **100% de logros**, y se muestra como un badge
  propio ("Completado al 100%"), visualmente distinto del platino de PSN — no se mezclan,
  porque no son lo mismo y el usuario lo va a notar.
- **Rate limits reales**: 100.000 llamadas por día por key. Suena mucho, pero el sync pide
  schema + logros **por juego**, y una biblioteca de Steam puede tener cientos de títulos.
  Vale la misma disciplina que en PSN: concurrencia limitada, upserts en bloque por título, y
  saltear juegos sin logros (`GetSchemaForGame` vacío) en vez de reintentarlos en cada sync.

### 12.2 Aislamiento

`lib/steam/` es a la Steam Web API lo que `lib/psn/` es a `psn-api`: **ninguna llamada a Steam
vive fuera de esa carpeta**. Mismos módulos espejados (`auth.ts` resuelve/valida el perfil,
`achievements.ts` trae logros y schema, `sync.ts` persiste, `concurrency.ts` se reusa el que ya
existe). `lib/external-guides/steam.ts` se queda donde está: resuelve appids para guías, no para
tracking, y no se mezclan.

### 12.3 Modelo de datos

- `steam_accounts` — espejo de `psn_accounts`: `user_id`, `steam_id64`, `persona_name`,
  `avatar_url`, `profile_visibility` (`public` | `private` — el equivalente a `token_status`),
  `verified` (false mientras no haya OpenID), `last_synced_at`. RLS: solo el dueño.
  **Sin columna de secreto cifrado**, porque no hay secreto.
- `games.source` suma `'steam'` (hoy: `manual` | `psn` | `catalog`), y `games.steam_appid`
  (integer, nullable) junto al `np_comm_id` que ya existe para PSN.
- `trophies` se reusa tal cual para los logros; `type` suma el valor `'achievement'`, que es el
  único que van a tener las filas de Steam. Todo lo que hoy agrupa por tipo tiene que tratar
  ese valor como "sin desglose", no como un cuarto color de trofeo.
- `user_trophies` se reusa sin cambios (`unlocked_at` ya es lo único que importa).
- **Un juego en las dos plataformas son dos filas de `games` en v1.** Deduplicar Bloodborne de
  PSN con su versión de Steam es el mismo problema de matching que ya tiene `lib/catalog/dedup.ts`
  con los remasters, y no vale la pena resolverlo antes de tener datos reales. El diario y las
  capturas quedan colgando de la fila de la plataforma donde se jugó, que además es lo correcto.
- `public_profiles` suma el nombre y avatar de Steam. **Cuidado**: es una vista SECURITY DEFINER,
  así que listar columnas de más ahí expone datos; solo `persona_name` y `avatar_url`.

### 12.4 Biblioteca: filtro por fuente

`/juegos` gana un selector de fuente con tres estados: **Todos** (default), **PSN**, **Steam**.

- Va como query param (`/juegos?fuente=steam`), no como estado de cliente: así el filtro es
  linkeable, sobrevive al refresh y el filtrado ocurre en la query de Postgres en vez de traer
  toda la biblioteca para esconder la mitad.
- El selector **solo aparece si el usuario tiene las dos cuentas conectadas**. Con una sola
  fuente, tres botones donde dos dan vacío es ruido.
- Cada tarjeta de juego lleva el logo de su plataforma; en "Todos" es lo único que distingue de
  dónde viene cada una.
- Las stats globales del perfil se muestran **separadas por plataforma**, no sumadas: un platino
  de PSN y un 100% de Steam no son la misma unidad y sumarlos da un número que no significa nada.
  El total de juegos sí se puede sumar.

### 12.5 Navegación: Configuración › Conexiones

La ruta `/psn` deja de existir como sección propia — hoy es un tab de nivel superior llamado
"PSN", lo cual ya no tiene sentido cuando hay dos plataformas.

```
/configuracion                 -> redirige a /configuracion/conexiones
/configuracion/conexiones      -> conectar/desconectar PSN y Steam
```

- En el header, el tab "PSN" se reemplaza por **"Configuración"**.
- Dentro de Configuración hay tabs internos; el primero (y único por ahora) es **"Conexiones"**.
  Queda como el lugar natural para lo que hoy no tiene casa: editar `display_name`, preferencias
  del diario, borrar la cuenta.
- Conexiones muestra **una tarjeta por plataforma**, cada una con su estado (conectada /
  no conectada / necesita atención), su último sync, su botón de sincronizar ahora y el de
  desconectar. Las instrucciones específicas (cómo sacar el NPSSO, cómo poner el perfil de
  Steam en público) viven adentro de cada tarjeta, no sueltas en la página.
- `/psn` se mantiene como **redirect** a `/configuracion/conexiones`: hay links guardados y el
  middleware ya la protege.
- `middleware.ts` tiene un matcher acotado a mano (ver `CLAUDE.md`, sección de performance):
  agregar `/configuracion` ahí es parte de la tarea, no un detalle — si se olvida, la ruta
  queda sin la capa de sesión del middleware.

### 12.6 Sync

- Manual: `/api/steam/sync`, espejo de `/api/psn/sync` (API route y no Server Action por lo
  mismo — declara `maxDuration`).
- Automático: **la misma ruta de cron**, `/api/cron/sync`, recorriendo también `steam_accounts`.
  No se agrega un segundo cron: el plan Hobby de Vercel limita la cantidad de cron jobs, y el
  trabajo es el mismo con otra fuente. Si una cuenta falla no aborta el resto, igual que hoy.
- El hook de platino del diario (`reconcilePlatinumDiaryEntry`) tiene su equivalente para el
  100% de Steam. Misma regla de ±14 días, campo distinto: no escribir `platinum_earned_at` con
  un logro de Steam, porque ese campo significa "platino de PSN" en toda la app.

---

*Este documento vive junto a `CLAUDE.md`. `CLAUDE.md` define las reglas permanentes del proyecto; este spec detalla el plan de ejecución del MVP y las decisiones de producto tomadas el 2026-08-15. Actualizar este archivo cuando cambien decisiones de alcance.*
