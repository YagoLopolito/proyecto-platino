# Proyecto Platino

Web app de seguimiento de trofeos de PlayStation + organizador de guías para desbloquear logros, con sincronización de la cuenta PSN del usuario.

## Visión del producto

Tres pilares:

1. **Trophy tracker**: cada usuario conecta su cuenta PSN y ve su progreso de trofeos (bronce/plata/oro/platino) por juego, con % de completitud y estadísticas globales (nivel de trofeos, rareza, ranking).
2. **Guía organizador**: por cada juego/trofeo, una checklist con guías de desbloqueo — pasos curados manualmente y/o enlaces a fuentes externas (PowerPyx, PSNProfiles, TrueTrophies, IGN, guías de YouTube). El usuario tilda lo que ya hizo y el sistema cruza eso con los trofeos ya obtenidos.
3. **Sync con PSN**: importar automáticamente los trofeos ya desbloqueados desde la cuenta real del usuario para que el tracker y las guías se actualicen solos, sin carga manual.

## Stack técnico

- **Frontend + backend**: Next.js (App Router) + React + TypeScript. API routes para toda la lógica que toca la PSN API (nunca desde el cliente).
- **Estilos**: Tailwind CSS.
- **Base de datos / auth**: Supabase (Postgres + Auth). Auth propia de la app (email/password o OAuth) separada de la sesión PSN — la cuenta PSN es un dato *vinculado* al usuario, no el login principal.
- **Deploy**: Vercel (compatible con Next.js) + proyecto Supabase en la nube.
- **Cron/jobs**: Vercel Cron o Supabase Edge Functions para sincronizar trofeos periódicamente en background.

## PSN API: qué existe y qué no

Sony **no tiene una API pública ni oficial** para trofeos. No hay developer program al que registrarse. Lo que existe es una API interna (la que usa my.playstation.com) documentada por la comunidad vía ingeniería inversa.

- Librería recomendada: **[`psn-api`](https://github.com/achievements-app/psn-api)** (npm, TypeScript, mantenida activamente, usada por PSNProfiles y otros trackers reales).
- **Autenticación**: se hace con el **NPSSO token** del usuario, no con usuario/contraseña. El usuario lo obtiene logueándose en playstation.com y visitando `https://ca.account.sony.com/api/v1/ssocookie` en el mismo navegador, que devuelve un JSON con el token.
- El NPSSO es equivalente a una contraseña de sesión: **nunca se expone al cliente ni se loguea**, se guarda cifrado en la base de datos y se usa solo server-side.
- El NPSSO expira (históricamente ~2 meses de inactividad). El flujo debe soportar reconexión: si el sync falla por token vencido, avisar al usuario para que vuelva a pegar un NPSSO nuevo.
- Como es una API no oficial, **puede cambiar o cortarse sin aviso**. El diseño debe aislar todas las llamadas a PSN detrás de una capa (`lib/psn/`) para poder adaptarse rápido si algo rompe.
- Respetar rate limits razonables (no hacer polling agresivo; sync programado, no en cada request del usuario).
**Estado actual: la integración con PSN está de vuelta** (`lib/psn/`, `/psn`, `/api/psn/sync`). Es la única fuente de juegos y trofeos — no hay carga manual en la app; todo sale del sync con la cuenta PSN real del usuario.

- `getProfileFromAccountId` **no acepta el alias `"me"`** (arma la URL como `/v1/share/profile/:accountId` sustituyendo el valor literal). `lib/psn/auth.ts` saca el `accountId` numérico de `getUserTrophyProfileSummary(auth, "me")` primero y recién ahí llama a `getProfileFromAccountId` con ese id. Este era el bug real que rompía la conexión con un `"Unexpected Error"` genérico.
- Se sospechaba que **Sony bloquea el intercambio de NPSSO desde IPs de datacenter** (Vercel/AWS). **Nunca se confirmó** y no se implementó proxy (`PSN_PROXY_URL`) — el bug del alias `"me"` alcanza para explicar el fallo original. Si el sync falla específicamente en producción (Vercel) pero funciona en local con el mismo NPSSO, ahí sí vale la pena investigar un proxy saliente (`undici`'s `ProxyAgent`) antes de asumir que es el único camino.
- Las filas de `games`/`trophies` que trae el sync quedan con `created_by = auth.uid()` y `source = 'psn'` (encaja con las RLS existentes sin migraciones nuevas). Limitación v1: si dos usuarios sincronizan el mismo juego, el catálogo compartido queda "de facto" en manos de quien lo sincronizó primero — `lib/psn/sync.ts` busca antes de escribir para no romper por RLS, pero no reescribe filas de otro usuario. Considerar un cliente service-role si esto se vuelve un problema real.
- **El primer sync real puede tardar** (varias decenas de juegos, cada uno con su propia consulta a PSN) y en Vercel eso se traduce en `FUNCTION_INVOCATION_TIMEOUT` si no se lo tiene en cuenta. `lib/psn/sync.ts` procesa títulos con concurrencia limitada (`lib/psn/concurrency.ts`) y hace los inserts/upserts de trofeos en bloque por título en vez de uno por uno (antes eran hasta 2 round-trips a la base *por trofeo*, lo cual escalaba fatal con bibliotecas grandes). `app/api/psn/sync/route.ts` declara `export const maxDuration = 300`, pero en el plan Hobby de Vercel el límite real sigue siendo 60s pase lo que declare la ruta — si el sync sigue dando timeout en producción con eso, el plan de Vercel es la causa más probable, no el código.
- `lib/covers/index.ts` (RAWG, vía `RAWG_API_KEY`) sólo complementa la carátula (`cover_url`) cuando se crea un juego nuevo por sync; nunca aporta trofeos ni bloquea el sync si falla.
- **Sync automático**: `app/api/cron/sync/route.ts` corre vía Vercel Cron (`vercel.json`, diario) y sincroniza todas las `psn_accounts` con `token_status = 'valid'`, con la misma concurrencia limitada que el sync manual. Usa `lib/supabase/service.ts` (service role, bypassea RLS) porque no hay sesión de cookies de usuario en un cron; nunca usar ese cliente en una ruta que sirve requests de usuarios. El endpoint exige `Authorization: Bearer ${CRON_SECRET}` (Vercel lo manda solo si `CRON_SECRET` está seteada en el proyecto) — sin esa variable, el endpoint rechaza todo con 401. Si una cuenta falla (NPSSO vencido, error de PSN), no aborta el resto: se guarda por-cuenta en la respuesta y `psn_accounts.token_status` queda en `'expired'` para que la UI le pida al usuario reconectar.

## Guías de desbloqueo: enfoque

No existe una API de "guías de trofeos". Dos caminos, no excluyentes:

1. **Curación propia**: guías escritas/editadas dentro de la app (markdown), asociadas a `game_id` / `trophy_id`. Es el contenido más confiable y evita temas de scraping.
2. **Enlaces a fuentes externas**: guardar links a guías existentes (PowerPyx, PSNProfiles, TrueTrophies, foros, YouTube) en vez de copiar su contenido. Citar siempre la fuente. **No scrapear sitios de terceros sin revisar sus términos de uso** — si se integra algo automatizado, priorizar fuentes con RSS/API propia antes que scraping.

**Estado actual: CRUD completo** en `app/juegos/[id]/guias/` (`actions.ts` + `page.tsx` + `AddGuideForm`/`EditGuideForm`/`AddStepForm`/`EditStepForm`), pero es secundario: la pantalla principal de guías prioriza enlaces externos y el advisor con IA, y el form de alta queda colapsado detrás de un `<details>` ("Crear una guía propia (opcional)"). El autor es el único que puede editar/borrar su guía (`assertOwnsGuide` chequea `author_id` antes de tocar `guide_steps`, y las policies de RLS en `guides`/`guide_steps` lo refuerzan del lado de la base). El checklist (`user_guide_progress`) es independiente por usuario y se auto-tilda si el trofeo asociado ya está en `user_trophies`.

## Enlaces externos curados automáticamente: `lib/external-guides/`

Pobla `game_external_guides` (tabla sin RLS de insert para `authenticated` — solo lectura pública; se escribe con `lib/supabase/service.ts`, ver migración `20260817130000_create_game_external_guides.sql`) combinando dos fuentes, ninguna paga ni hace scraping de HTML de terceros:

- `lib/external-guides/steam.ts` — Steam Web API oficial (`IPublishedFileService/QueryFiles`, requiere `STEAM_API_KEY`, gratis) para traer las guías de la comunidad de Steam mejor puntuadas de un juego. Resuelve el appid antes vía `store.steampowered.com/api/storesearch` (público, sin key). `filetype=11` es `k_EWorkshopFileType.WebGuide` — **no usar `9`** (es `Concept`, no trae nada).
- `lib/external-guides/site-search.ts` — no depende de ninguna API (ni paga ni gratis): arma un link a la búsqueda propia de PowerPyx/PSNProfiles/TrueTrophies para el nombre del juego (`?s=`/`/search/games?q=`/`game_search.php?search=`). No se fetchea ni se lee el HTML de esos sitios del lado del servidor — el usuario abre el link y navega los resultados en su propio browser. Se probó antes con la tool `web_search` de Claude (requiere créditos pagos de la API de Anthropic); se reemplazó por esto para que todo el flujo sea gratuito.
- `lib/external-guides/index.ts` — `populateExternalGuidesForGame()` combina ambas fuentes (Steam vía try/catch, si falla no bloquea a los links de búsqueda) y hace upsert con `onConflict: "game_id,url"` para no duplicar. `createServiceClient()` se llama sin try/catch propio adentro de esta función — si falta `SUPABASE_SERVICE_ROLE_KEY` tira una excepción sin capturar; por eso `findExternalGuides` (Server Action en `actions.ts`) envuelve toda la llamada en try/catch y devuelve el error como parte del estado en vez de dejar que la excepción llegue sin capturar al framework (que la muestra como error 500 genérico, "This page couldn't load").
- Se dispara manualmente desde `app/juegos/[id]/enlaces/` (botón "Buscar guías externas", `FindExternalGuidesButton.tsx` + `actions.ts`), no hay cron todavía.
- PowerPyx/PSNProfiles/TrueTrophies no tienen API propia y bloquean scraping directo (Cloudflare); si en el futuro se necesita traer el contenido real de sus guías (no solo un link de búsqueda), primero hay que revisar sus términos de uso (regla general de la sección "Guías de desbloqueo" arriba).

## Advisor con IA: `lib/ai/`

Igual patrón que `lib/psn/`: toda llamada al LLM vive acá, nunca directo en componentes ni rutas. Ver `PRODUCT_SPEC.md` sección 4 para el diseño completo (input/output esperado).

- `lib/ai/prompt.ts` — arma el system prompt y el prompt de usuario (juego + trofeos + guías propias ya cargadas, para que la IA no las contradiga).
- `lib/ai/client.ts` — `generateAiGamePlan()`, llama a la API de Groq (`groq-sdk`, modelo `openai/gpt-oss-120b`, free tier sin tarjeta) server-side con `response_format: { type: "json_object" }`. Si la respuesta no matchea el schema, reintenta **una sola vez** pidiéndole al modelo que corrija el JSON; si vuelve a fallar tira `AiSchemaValidationError` (nunca cachear ni devolver un 500 silencioso — el caller decide cómo mostrar "no se pudo generar").
- `lib/ai/schema.ts` — schema de Zod (`aiGamePlanSchema`) que valida la estructura exacta de la sección 4 del spec. Los `trofeo_id` del output son siempre el `id` (uuid interno de `trophies`), no el `trophy_id` texto que usa la API de PSN — así se puede cruzar directo con `user_trophies`/`guide_steps` sin una tabla de mapeo extra.
- `lib/ai/errors.ts` — `AiProviderError` (falló la llamada al proveedor) vs `AiSchemaValidationError` (la llamada anduvo pero el JSON no sirve); distinguirlos importa para decidir si vale la pena reintentar.
- **Estado actual: Fase 6 completa.** `app/juegos/[id]/ai-actions.ts` (`generateAiPlan`, Server Action — no API route, porque depende de la sesión de cookies del usuario igual que las guías) arma el input desde trofeos + `user_trophies` + guías propias, llama `generateAiGamePlan()` y siempre inserta una fila nueva en `ai_game_plans` (versionado: nunca pisa la anterior, `status` `ok`/`error`). `app/juegos/[id]/AiAdvisorPanel.tsx` (Client Component) muestra el último plan `ok` cacheado y expone el botón "Generar plan"/"Regenerar plan"; el label de "contenido generado por IA" está siempre visible en el panel, no solo en el resultado.
- Requiere `AI_PROVIDER_API_KEY` (API key de Groq, gratis en console.groq.com sin tarjeta) server-side, nunca `NEXT_PUBLIC_`. El free tier tiene rate limit bajo (30 req/min, 14.4k req/día a nivel organización) — si el advisor empieza a fallar con error 429, es eso, no un bug.

## Performance: lag general de la app

Diagnóstico (2026-08-19) sobre por qué la app se sentía lenta "en todos lados", no solo en el sync de PSN:

- **`middleware.ts` corría en cada request de toda la app** (matcher original excluía solo estáticos), haciendo `supabase.auth.getUser()` — un round-trip a Supabase Auth — antes de renderizar cualquier página, incluidas públicas. Ahora el `matcher` está acotado a las rutas que realmente dependen de sesión: `/perfil`, `/juegos`, `/psn`, `/login`, `/registro`, `/auth`. El resto de la app no paga ese costo. Cada página protegida sigue validando su propia sesión server-side además del middleware (redundante a propósito, no se tocó — ver convención de doble capa de autoría en guías).
- **Queries a Supabase en serie que no dependían entre sí**: `app/juegos/[id]/page.tsx` encadenaba con `await` game → trophies → user_trophies → plan de IA cacheado (solo dependen de la `membership` ya confirmada); `app/juegos/page.tsx` encadenaba psnAccount → library, y por separado trophies → user_trophies. Se pasaron a `Promise.all` donde no había dependencia real. `app/perfil/page.tsx` ya usaba `Promise.all` para su primer par de queries — quedó como estaba.
- **`next/image` con `unoptimized`** en `GameCard.tsx`, `TrophyItem.tsx` y `juegos/[id]/page.tsx`: estaba puesto porque `next.config.ts` no tenía `images.remotePatterns` configurado (Next rechaza hosts no whitelisteados). Se agregaron patterns para los hosts reales de donde vienen las imágenes (`*.playstation.com`, `*.rawg.io`, `*.steamgriddb.com`) y se sacó `unoptimized` — ahora Next sirve las carátulas/íconos resizeadas y en WebP/AVIF vía su optimizador, en vez del archivo original.
- Faltaba `loading.tsx` en `app/psn/` (sí existía en `/juegos`, `/juegos/[id]`, `/perfil`) — se agregó, mismo patrón que las demás rutas (`LoadingState`).
- **Ya resuelto (2026-08-20)**: lo de arriba se implementó. `get_library_trophy_stats()` (migración `20260820020000_library_trophy_stats_rpc.sql`) agrega total/obtenidos por juego y por tipo con `GROUP BY` en Postgres, `security invoker` + `auth.uid()` (respeta las RLS existentes, no hace falta service role). `juegos/page.tsx` y `perfil/page.tsx` llaman a este RPC en vez de paginar manualmente por miles de filas de `trophies`/`user_trophies`. `juegos/[id]/page.tsx` (una sola página de juego, no necesita agregación entre juegos) en cambio filtra `user_trophies` con `.in("trophy_id", trophyIds)` acotado a los trofeos de ese juego -- sin RPC, ya que ahí alcanza con no traer los trofeos de TODOS los demás juegos del usuario. Confirmado con la cuenta real del usuario que esto era el cuello de botella real (208 juegos / 10.284 trofeos / 2.076 desbloqueados hacían que `/juegos` tardara 4-7s de puro `application-code` en el server, incluso después de paralelizar queries).

Verificación manual: `npx tsc --noEmit` y `eslint` limpios sobre los archivos tocados; se levantó el dev server y se confirmó con `curl` que `/juegos`, `/psn` y `/perfil` siguen devolviendo 307 a `/login` sin sesión (el middleware acotado sigue protegiendo esas rutas), y que rutas públicas (`/`, `/registro`) cargan sin pasar por el middleware.

## Modelo de datos (borrador)

- `users` — cuenta de la app (Supabase Auth).
- `psn_accounts` — vínculo user ↔ PSN (online_id, account_id, npsso cifrado, estado del token, última sync).
- `games` — catálogo de juegos (np_comm_id, nombre, ícono, plataforma).
- `trophies` — trofeos por juego (nombre, descripción, tipo, ícono, oculto/no).
- `user_trophies` — trofeos obtenidos por usuario (fecha de desbloqueo, viene de sync PSN).
- `guides` — guía por juego (autor, contenido markdown o link externo, fuente).
- `guide_steps` — pasos de una guía, opcionalmente ligados a un `trophy_id`.
- `user_guide_progress` — checklist de pasos completados por el usuario, independiente de si el trofeo ya sincronizó.
- `ai_game_plans` — planes generados por el advisor de IA por juego (`payload_json` con la estructura de `lib/ai/schema.ts`, `user_id` nullable si el plan es genérico/compartible). Ver `PRODUCT_SPEC.md` sección 6 para el detalle de columnas y RLS.
- `game_diary_entries` — Letterbox: entradas de diario por partida terminada (rating 0-10, reseña, fecha). Ver sección dedicada abajo.

## Letterbox: diario de partidas (`game_diary_entries`, `game_scores`)

- Diario **público** a diferencia de `user_trophies` (privado) — decisión de producto: cualquier
  usuario puede leer el diario de cualquier otro, pero solo el dueño (`user_id = auth.uid()`)
  puede insertar/editar/borrar sus propias filas (RLS en
  `supabase/migrations/20260821000000_letterbox_diary.sql`).
- Múltiples entradas por usuario+juego (rejugadas), vía `playthrough_number` autoincremental
  (`unique(user_id, game_id, playthrough_number)`). El cálculo del siguiente número
  (`nextPlaythroughNumber` en `app/juegos/[id]/diario/actions.ts`) no es 100% race-safe bajo doble
  submit simultáneo — se apoya en ese `unique` y en capturar el error `23505` con un mensaje
  pidiendo reintentar, no en un lock explícito.
- `finished_on` es una columna `date` (sin hora/timezone) que recibe tal cual el string de un
  `<input type="date">` (fecha local del usuario) — nunca pasar por `new Date().toISOString()`,
  correría a UTC y podría desplazar el día.
- Vista `game_scores` promedia el **último** rating de cada usuario por juego (no todas las
  rejugadas) — ver el `distinct on (game_id, user_id) ... order by playthrough_number desc` en la
  migración. `security_invoker = true` (misma convención que `get_library_trophy_stats`).
- `games.source` ahora incluye `'catalog'` (juegos agregados desde la búsqueda de RAWG, no
  sincronizados por PSN ni cargados a mano) y `games.external_catalog_id` guarda el id de RAWG.

## `lib/covers/`: búsqueda de catálogo (`searchCatalogGames`)

- Además de `findCoverUrl` (carátula única, ya existente), expone `searchCatalogGames(query)`
  para el buscador del Letterbox: varios candidatos de RAWG filtrados a plataformas PlayStation
  (`parent_platforms[].platform.slug`), no solo el primer resultado.
- Devuelve un status explícito `"missing_api_key"` cuando falta `RAWG_API_KEY` en vez de un
  `null`/`[]` silencioso, para que el caller pueda avisarlo en la UI en vez de fallar en silencio.
- Sigue siendo el único lugar que hace `fetch` a la búsqueda de RAWG (comparte el helper interno
  `fetchRawgGames` con `findCoverUrl` para no reimplementar el cliente HTTP dos veces) — igual
  regla de aislamiento que `lib/psn/`/`lib/ai/`.

## `lib/catalog/`: alta de juegos de catálogo al diario

- `searchCatalog` combina juegos ya existentes en `games` (por nombre, `ilike`) con
  `searchCatalogGames` de `lib/covers`, deduplicados (`lib/catalog/dedup.ts`).
- El matching de remasters/remakes (`dedupeAndFlag`) es una heurística de similitud de nombre
  (sacando tokens como "remastered"/"remake"/"definitive edition") con confirmación manual del
  usuario ("¿es el mismo juego?") cuando detecta un posible duplicado — no bloqueante, se puede
  afinar después (issue #90).
- `addCatalogGame` inserta en `games` con `source: 'catalog'` y `created_by: auth.uid()`
  reusando `games_insert_authenticated` tal cual (sin RLS nueva), y vincula el juego en
  `user_games` si el usuario todavía no lo tenía.

## Flujo de trabajo con GitHub

- Cuando se trabaja sobre un issue de GitHub, siempre actualizar el issue (comentario y/o
  cierre) y vincular el PR correspondiente al terminar el trabajo — no dejar el issue
  desactualizado respecto al estado real del código.

## Convenciones de código

- TypeScript estricto, sin `any` salvo en boundaries de librerías externas.
- Toda llamada a `psn-api` vive en `lib/psn/`, nunca directo en componentes ni en rutas sueltas; toda llamada al LLM vive en `lib/ai/`, mismo criterio (ver arriba).
- Server Components por defecto; Client Components solo donde haya interactividad real.
- Variables sensibles (NPSSO, service role key de Supabase, API key de IA) solo en variables de entorno server-side, nunca prefijo `NEXT_PUBLIC_`.
- Los módulos server-only (`lib/psn/*`, `lib/ai/*`) arrancan con `import "server-only";` para que Next tire error de build si algo los importa desde un Client Component por accidente.
- Mutaciones desde la UI van como Server Actions (`"use server"` en `actions.ts` junto a la página, `useActionState` del lado del cliente) — es el patrón usado en `app/juegos/[id]/guias/`, no API routes salvo que la lógica no dependa de la sesión de cookies del usuario (ej. `app/api/psn/sync`, que declara `maxDuration`).
- **Regla de lint (`react-hooks/set-state-in-effect`)**: no llamar a un setter de `useState` dentro de un `useEffect` para sincronizar con el resultado de una Server Action (ej. cerrar un form de edición cuando `useActionState` devuelve éxito). En vez de eso, comparar el `state` actual contra una copia guardada con `useState` y, si cambió, ajustar el estado **durante el render** (patrón oficial de React, no dispara el lint). Ver `EditGuideForm.tsx`/`EditStepForm.tsx` para el ejemplo de referencia.
- Autoría/edición de contenido de usuario (guías) siempre se valida en dos capas: en la Server Action (`assertOwnsGuide` o `.eq("author_id", user.id)` en la query) **y** en la policy de RLS correspondiente — ninguna alcanza sola como única defensa.

## Roadmap sugerido

1. Auth + esquema base en Supabase. ✅
2. Conexión de cuenta PSN (input de NPSSO) + primer sync manual de trofeos. ✅
3. Vista de perfil: juegos, % completitud, trofeos por juego. ✅
4. Sync automático (cron) + manejo de expiración de token. ✅ (`app/api/cron/sync/`, ver detalle abajo). El disparo manual (`/api/psn/sync`) sigue existiendo para el primer sync y para reconectar tras un NPSSO vencido.
5. Guías propias (CRUD simple) ligadas a juegos/trofeos. ✅ (`app/juegos/[id]/guias/`)
6. Checklist de guía cruzada con trofeos ya obtenidos. ✅ (`toggleStepProgress` + auto-tilde si el trofeo ya sincronizó)
7. Enlaces a guías externas curadas. ✅ campo (`external_url`/`source`) dentro de una guía + vista dedicada de "enlaces por juego" (`app/juegos/[id]/enlaces/`), Fase 9 completa.
8. Advisor con IA (`lib/ai/`): cliente + prompt + validación de schema + endpoint + UI del panel + guardado versionado en `ai_game_plans`. ✅ Fase 6 completa.
9. Letterbox de juegos: diario público de partidas terminadas con rating, buscador de catálogo (RAWG) para loguear cualquier juego de PSN aunque no esté sincronizado. ✅ Fase 12 completa (issues #88-91: `game_diary_entries`/`game_scores`, `lib/covers` búsqueda multi-resultado, `lib/catalog/` alta de juegos, CRUD en `app/juegos/[id]/diario/`).

Ver `PRODUCT_SPEC.md` para el detalle completo de fases (0-10), decisiones de producto y Definition of Done por issue — este roadmap es el resumen corto.

## Variables de entorno esperadas

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

- `PSN_TOKEN_ENCRYPTION_KEY`: requerida para conectar cuentas PSN (cifra el NPSSO en reposo). 32 bytes en base64 — generar con `openssl rand -base64 32`.
- `AI_PROVIDER_API_KEY`: requerida para el advisor con IA (`lib/ai/`). API key de Groq (console.groq.com), gratis sin tarjeta. Sin ella, tira error al primer llamado — no rompe nada más de la app porque no se invoca en el sync ni en el render de páginas. `lib/external-guides/` (enlaces externos) no depende de esta key: usa Steam Web API + links de búsqueda, gratis, sin IA.
- `RAWG_API_KEY`: opcional. Sin ella, `lib/covers` no completa carátulas y el sync sigue funcionando igual con los íconos que trae PSN.
- `STEAMGRIDDB_API_KEY`: opcional. Fallback de `lib/covers` cuando RAWG no encuentra la carátula (o falta `RAWG_API_KEY`). Sin ninguna de las dos, el sync sigue funcionando igual con los íconos que trae PSN.
- `STEAM_API_KEY`: opcional, gratis en steamcommunity.com/dev/apikey. Sin ella, `lib/external-guides/steam.ts` no trae guías de Steam Community — los links de búsqueda a PowerPyx/PSNProfiles/TrueTrophies (`site-search.ts`) siguen funcionando igual.
- `CRON_SECRET`: requerida para que `/api/cron/sync` acepte invocaciones. Vercel la agrega sola como header en las llamadas que dispara desde `vercel.json` si está seteada en el proyecto — sin ella el cron queda deshabilitado (401 siempre) pero el sync manual (`/api/psn/sync`) no se ve afectado.
