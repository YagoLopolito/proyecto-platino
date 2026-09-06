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
- **Horas jugadas**: `lib/psn/playtime.ts` trae el `playDuration` de `getUserPlayedGames` (ISO 8601, ej. `"PT228H56M33S"`) y lo guarda en `user_games.playtime_minutes`, la misma columna que ya llenaba Steam. Esa lista está indexada por `titleId` (`CUSA…`/`PPSA…`) y los trofeos por `npCommunicationId` (`NPWR…`), y Sony no publica un mapeo entre las dos: el cruce es **por nombre normalizado**, con las mismas limitaciones que `adoptCatalogGame` (remasters y ediciones pueden no matchear). Es una sola llamada paginada por biblioteca, no una por juego, y va en un `.catch` — si el endpoint falla o cambia, el sync de trofeos sigue. Cuando un título no matchea, la columna **ni se menciona en el upsert**, para no pisar con NULL un valor ya guardado. Las horas de PSN y las de Steam **no son comparables** (Steam cuenta el proceso abierto; PSN, sesiones de consola desde que empezó a trackearlas): se muestran por juego, nunca sumadas entre plataformas. El formato es `lib/playtime.ts` (`formatPlaytime`), compartido por la tarjeta de `/juegos` y la ficha de `/juegos/[id]/diario`. Dos detalles del endpoint que costaron una corrida real: hay que **pedir las `categories` explícitamente** (`ps4_game,ps5_native_game,pspc_game,unknown` — el default deja afuera media biblioteca) y el corte de la paginación **no puede ser `titles.length < limit`**, porque PSN devuelve páginas más chicas que el limit pedido y con eso se cortaba en la primera página (solo quedaban con horas los últimos juegos jugados). El sync loguea un resumen (`[psn-sync] horas jugadas: N títulos devueltos…`) para poder ver si el cruce por nombre está fallando sin tener que mirar la base.
- `lib/covers/index.ts` (RAWG, vía `RAWG_API_KEY`) sólo complementa la carátula (`cover_url`) cuando se crea un juego nuevo por sync; nunca aporta trofeos ni bloquea el sync si falla.
- **Sync automático**: `app/api/cron/sync/route.ts` corre vía Vercel Cron (`vercel.json`, diario) y sincroniza todas las `psn_accounts` con `token_status = 'valid'`, con la misma concurrencia limitada que el sync manual. Usa `lib/supabase/service.ts` (service role, bypassea RLS) porque no hay sesión de cookies de usuario en un cron; nunca usar ese cliente en una ruta que sirve requests de usuarios. El endpoint exige `Authorization: Bearer ${CRON_SECRET}` (Vercel lo manda solo si `CRON_SECRET` está seteada en el proyecto) — sin esa variable, el endpoint rechaza todo con 401. Si una cuenta falla (NPSSO vencido, error de PSN), no aborta el resto: se guarda por-cuenta en la respuesta y `psn_accounts.token_status` queda en `'expired'` para que la UI le pida al usuario reconectar.

## Steam: segunda plataforma

Decidido el 2026-08-23: **la misma conexión que hay con PSN, pero para Steam**, con las dos
conviviendo. Ver `PRODUCT_SPEC.md` sección 12 para el diseño completo (endpoints, modelo de
datos, navegación); acá van las reglas permanentes.

**Estado actual: fase completa** (issues #110-#119): `lib/steam/`, `steam_accounts`,
`/api/steam/sync`, Configuración › Conexiones, filtro por fuente en `/juegos`
(`?fuente=steam`), stats del perfil separadas por plataforma, `steam_accounts` en
`/api/cron/sync`, diario al 100% (`game_diary_entries.completed_at`) y verificación por
Steam OpenID.

- **Toda llamada a la Steam Web API de tracking vive en `lib/steam/`**, misma regla de
  aislamiento que `lib/psn/` y `lib/ai/`. `lib/external-guides/steam.ts` se queda donde está:
  resuelve appids para traer guías de la comunidad, no logros — son cosas distintas y no se
  mezclan.
- Al revés que PSN, **Steam sí tiene Web API oficial** con key gratis (la `STEAM_API_KEY` que ya
  existe). La key es **de la app, no del usuario**: no hay equivalente al NPSSO, así que no hay
  secreto por usuario que cifrar ni que expire. El modo de falla no es "token vencido" sino
  **"perfil en privado"** (con "Detalles del juego" en privado, `GetOwnedGames` y
  `GetPlayerAchievements` devuelven vacío aunque la key sea válida).
- El usuario aporta su SteamID64 o su URL personalizada (`ISteamUser/ResolveVanityURL`). Eso
  **no verifica** que la cuenta sea suya; la forma correcta es Steam OpenID ("Sign in through
  Steam", gratis, sin key), que queda como paso siguiente — mientras tanto la cuenta se marca
  como no verificada.
- **Steam no tiene platino ni tipos de logro.** Nada de bronce/plata/oro, ni nivel de trofeos.
  Todo lo que hoy agrupa o colorea por `trophies.type` tiene que tratar el valor nuevo
  `'achievement'` como "sin desglose", no como un cuarto color. El equivalente al platino es el
  **100% de logros**, y va como badge propio, visualmente distinto del platino de PSN. En el
  diario, **nunca escribir `platinum_earned_at` con un logro de Steam**: ese campo significa
  "platino de PSN" en toda la app.
- Tablas: `steam_accounts` (espejo de `psn_accounts`, sin columna de secreto cifrado),
  `games.steam_appid` (unique parcial), `games.steam_has_achievements` (NULL = no se preguntó;
  false = confirmado sin logros, no volver a pedir el schema en cada sync) y `games.source` suma
  `'steam'`. Migraciones `20260823010000_steam_accounts.sql` y
  `20260823010100_games_steam_achievements.sql`. Un juego que está en las dos plataformas
  son **dos filas de `games` en v1** — deduplicar es el mismo problema de matching que
  `lib/catalog/dedup.ts` con los remasters y no se resuelve antes de tener datos reales.
- **Steam puede devolver `playtime_forever = 0` en toda la biblioteca**: es la opción "Mantener en privado el tiempo total de juego" de la privacidad de Steam, que convive con un perfil público (los logros siguen sincronizando). No se puede arreglar por código — `syncSteamAchievementsForUser` lo detecta (`playtimeHidden`: biblioteca no vacía y todos los juegos en 0) y la UI del botón de sync explica qué destildar. Es distinto de `SteamProfilePrivateError`, que es "Detalles del juego" en privado y no trae ni juegos.
- Rate limit real: 100.000 llamadas por día por key. Suena mucho, pero el sync pide schema +
  logros **por juego**: misma disciplina que PSN (concurrencia limitada vía
  `lib/psn/concurrency.ts`, upserts en bloque por título, saltear juegos sin logros en vez de
  reintentarlos en cada sync).
- El sync manual es `POST /api/steam/sync` (`app/api/steam/sync/route.ts`, `maxDuration = 300`),
  espejo del de PSN. Devuelve 409 con `reason: "private"` cuando el perfil está en privado: es
  el único estado que el usuario puede arreglar, y se distingue del 500 genérico a propósito.
- **Verificación por Steam OpenID** (`lib/steam/openid.ts` + `app/api/steam/openid/route.ts`):
  es OpenID 2.0, no OIDC, y no usa `STEAM_API_KEY`. Va como route handler y no como Server
  Action porque el callback de Steam es una navegación (GET). El POST de
  `check_authentication` de vuelta a Steam **no es opcional**: los parámetros de la URL los
  puede escribir cualquiera, y sin revalidarlos "verificado" no significa nada. Si el SteamID
  verificado no coincide con el que ya estaba cargado, se le avisa al usuario en vez de
  pisarle la cuenta.
- El equivalente del platino para el diario es `game_diary_entries.completed_at`
  (`source = 'completion_sync'`), con la misma regla de ±14 días: `lib/diary/platinum.ts`
  quedó parametrizado por condición en vez de duplicado. La fecha es la del **último logro**,
  no la del sync.
- El sync automático **reusa `/api/cron/sync`**, recorriendo también `steam_accounts`. No se
  agrega un segundo cron: el plan Hobby de Vercel limita la cantidad de cron jobs y el trabajo es
  el mismo con otra fuente.

### Biblioteca con dos fuentes

`/juegos` gana un selector **Todos** (default) / **PSN** / **Steam**, como query param
(`/juegos?fuente=steam`), no como estado de cliente: así es linkeable, sobrevive al refresh y el
filtro ocurre en la query de Postgres en vez de traer toda la biblioteca para esconder la mitad.
El selector **solo aparece si el usuario tiene las dos cuentas conectadas**. Las stats del perfil
van **separadas por plataforma**, no sumadas: un platino de PSN y un 100% de Steam no son la
misma unidad.

### Navegación: `/psn` es Configuración › Conexiones

El tab de nivel superior "PSN" deja de tener sentido con dos plataformas. Pasa a llamarse
**Configuración**, y adentro tiene tabs; el primero (y único por ahora) es **Conexiones**, con
una tarjeta por plataforma (estado, último sync, sincronizar ahora, desconectar) y las
instrucciones de cada una adentro de su tarjeta. `/psn` quedó como **redirect** a
`/configuracion/conexiones`, y el matcher de `middleware.ts` (acotado a mano, ver sección de
performance) ya cubre `/configuracion`. Las Server Actions de las dos plataformas viven en
`app/(app)/configuracion/conexiones/actions.ts`; las tarjetas son
`components/connections/`. Desconectar **no borra** juegos ni trofeos ya sincronizados: son
del usuario y el diario cuelga de ellos.

## Guías de desbloqueo: enfoque

No existe una API de "guías de trofeos". Dos caminos, no excluyentes:

1. **Curación propia**: guías escritas/editadas dentro de la app (markdown), asociadas a `game_id` / `trophy_id`. Es el contenido más confiable y evita temas de scraping.
2. **Enlaces a fuentes externas**: guardar links a guías existentes (PowerPyx, PSNProfiles, TrueTrophies, foros, YouTube) en vez de copiar su contenido. Citar siempre la fuente. **No scrapear sitios de terceros sin revisar sus términos de uso** — si se integra algo automatizado, priorizar fuentes con RSS/API propia antes que scraping.

**Estado actual: eliminada de la UI.** La pantalla `app/(app)/juegos/[id]/guias/` se borró: no tenía alta de guías (el form y `createGuide` ya se habían sacado) y el checklist quedó sin uso frente al advisor con IA y los enlaces externos, que son lo que la ficha del juego prioriza. Las tablas `guides`/`guide_steps`/`user_guide_progress` **siguen existiendo** con sus RLS: `lib/ai/prompt.ts` sigue leyendo las guías propias para que la IA no las contradiga, y `/juegos/[id]/enlaces` muestra las filas de `guides` que tengan `external_url`. Hoy esas filas solo se crean del lado de la base. Si alguna vez vuelve una UI de guías, la regla de autoría sigue siendo la de siempre: validar en la Server Action **y** en la RLS.

## Enlaces externos curados automáticamente: `lib/external-guides/`

Pobla `game_external_guides` (tabla sin RLS de insert para `authenticated` — solo lectura pública; se escribe con `lib/supabase/service.ts`, ver migración `20260817130000_create_game_external_guides.sql`) combinando dos fuentes, ninguna paga ni hace scraping de HTML de terceros:

- `lib/external-guides/steam.ts` — Steam Web API oficial (`IPublishedFileService/QueryFiles`, requiere `STEAM_API_KEY`, gratis) para traer las guías de la comunidad de Steam mejor puntuadas de un juego. Resuelve el appid antes vía `store.steampowered.com/api/storesearch` (público, sin key). `filetype=11` es `k_EWorkshopFileType.WebGuide` — **no usar `9`** (es `Concept`, no trae nada). **No alcanza con pedir lo más votado**: el top de votos de un juego suelen ser traducciones no oficiales, mods y curiosidades, no guías para platinar. Se hacen dos consultas y se cruzan: una por etiqueta (`requiredtags` con Achievements/Walkthroughs/Secrets/… + `match_all_tags=false`, que es la mejor señal porque la etiqueta la pone el autor) y otra por texto (`query_type=12`, para los juegos donde nadie etiquetó nada). `lib/external-guides/steam-relevance.ts` (sin `server-only` a propósito, es texto puro y se testea) descarta el ruido conocido y ordena por relevancia; las etiquetadas pesan más que las que sólo matchean por título. Además filtra por idioma (`isReadableLanguage`): **solo español e inglés** — se descarta todo título en escritura no latina (cirílico, CJK, hangul…) y los marcadores de otros idiomas latinos (portugués, italiano, alemán, francés, polaco…), por bien puntuada que esté la guía. Como el upsert nunca borra, `populateExternalGuidesForGame` **borra las filas `source_type = 'steam_api'` del juego antes de reinsertar** (solo si Steam contestó): sin eso, los enlaces guardados por una versión anterior del filtro seguían apareciendo para siempre.
- `lib/external-guides/site-search.ts` — no depende de ninguna API (ni paga ni gratis): arma un link a la búsqueda propia de PowerPyx/PSNProfiles/TrueTrophies para el nombre del juego (`?s=`/`/search/games?q=`/`game_search.php?search=`). No se fetchea ni se lee el HTML de esos sitios del lado del servidor — el usuario abre el link y navega los resultados en su propio browser. Se probó antes con la tool `web_search` de Claude (requiere créditos pagos de la API de Anthropic); se reemplazó por esto para que todo el flujo sea gratuito.
- `lib/external-guides/index.ts` — `populateExternalGuidesForGame()` combina ambas fuentes (Steam vía try/catch, si falla no bloquea a los links de búsqueda) y hace upsert con `onConflict: "game_id,url"` para no duplicar. `createServiceClient()` se llama sin try/catch propio adentro de esta función — si falta `SUPABASE_SERVICE_ROLE_KEY` tira una excepción sin capturar; por eso `findExternalGuides` (Server Action en `actions.ts`) envuelve toda la llamada en try/catch y devuelve el error como parte del estado en vez de dejar que la excepción llegue sin capturar al framework (que la muestra como error 500 genérico, "This page couldn't load").
- Se dispara manualmente desde `app/juegos/[id]/enlaces/` (botón "Buscar guías externas", `FindExternalGuidesButton.tsx` + `actions.ts`), no hay cron todavía.
- PowerPyx/PSNProfiles/TrueTrophies no tienen API propia y bloquean scraping directo (Cloudflare); si en el futuro se necesita traer el contenido real de sus guías (no solo un link de búsqueda), primero hay que revisar sus términos de uso (regla general de la sección "Guías de desbloqueo" arriba).

## Tiempos estimados de juego: `lib/time-to-beat/`

Cuánto lleva pasarse la historia principal y cuánto llegar al 100%, como HowLongToBeat. Se
muestran en la ficha de trofeos (`GameDetailHero`) y en la de diario (`GameHero`), las dos vía
`components/game/TimeToBeat.tsx`.

- **HowLongToBeat no tiene API pública** y no se usa: lo que circula por ahí es su endpoint
  interno de búsqueda, que exige un hash sacado del bundle JS del sitio y cambia en cada
  release (el mismo problema que el GraphQL de la PS App), además de un ToS que no permite
  scrapearlo. La fuente es **IGDB** (`game_time_to_beat`, de Twitch/Amazon): API oficial,
  gratis, y es el único proveedor que publica los **dos** números (`normally` y `completely`,
  en segundos).
- **IGDB primero y, para lo que no tiene, una estimación del LLM** (`generateTimeEstimates` en
  `lib/ai/`, horas enteras, con el mismo `NO_CONOZCO` que la descripción). La ficha **siempre
  cita la fuente**, y la de IA lleva el ✨ y un "puede tener errores": un agregado de partidas
  reales y la estimación de un modelo no valen lo mismo. El fallback existe porque IGDB no
  cubre buena parte de una biblioteca real (juegos nuevos, colecciones LEGO, ediciones
  regionales) y la sección desaparecía justo donde más se la busca.
- **El `playtime` de RAWG no sirve para esto y no se vuelve a intentar.** Se probó como
  fallback y hubo que revertirlo: ese campo no es "cuánto lleva pasarlo" sino las horas que
  los usuarios de RAWG declaran haber jugado, así que para un juego con pocos registros
  devuelve 1 o 2 — en la biblioteca real puso **1 h en SILENT HILL 2** y 8 h en RESIDENT EVIL
  6. Un número creíble pero equivocado bajo una etiqueta que no le corresponde es peor que
  ninguno.
- **El tiempo de completitud se etiqueta "Platino"** cuando el juego tiene un trofeo de ese
  tipo, y "Al 100%" cuando no (Steam). Nadie publica un tiempo de platino — IGDB tampoco —
  pero su `completely` es el 100% de completitud, que es justo lo que destraba el platino en
  la enorme mayoría de los juegos. La ficha de trofeos ya tiene los trofeos cargados; la de
  diario hace un `count` con `head: true` sobre `trophies` para saberlo.
- `lib/time-to-beat/match.ts` es puro y sin `server-only` (se testea desde el spec, igual que
  `steam-relevance` y `screenshot-import`). El match contra IGDB **no puede ser exacto**: los
  nombres del catálogo traen ®/™, sufijos de tienda ("Call of Duty: Black Ops II -
  Multiplayer") o son más cortos que el título real ("Skyrim"), y exigir igualdad descartaba
  casi todo. Va en tres pasadas: exacto por `comparableName`, después **sufijo** (el catálogo
  guarda el nombre corto y IGDB le antepone la saga) y por último similitud de palabras sobre
  `MIN_NAME_SIMILARITY`. La asimetría prefijo/sufijo es la regla clave: que el candidato
  **agregue palabras al final** ("God of War" → "God of War Ragnarök") significa otra entrega
  o un DLC, y se descarta. Un tiempo en 0 (así manda IGDB lo que no sabe) se trata como "no
  hay dato", nunca como "0 h".
- **Un fallo al consultar no se cachea.** `findIgdbTimeToBeat` distingue tres cosas:
  `ok`, `not_found` (IGDB contestó y no sabe → se cachea) y `unavailable` (sin credenciales,
  red, 401, timeout → **no** se escribe `time_estimates_checked_at`). Sin esa distinción, la
  primera visita a una ficha con las credenciales todavía sin cargar dejaba el juego marcado
  como consultado y sin tiempos para siempre; pasó de verdad con 13 juegos y hubo que
  limpiarlos a mano. Cada camino que no termina en datos se loguea con prefijo `[igdb]`: sin
  eso, "faltan credenciales" y "IGDB no conoce el juego" se veían idénticos desde afuera.
- Se cachean en `games` (`time_to_beat_minutes`, `time_to_complete_minutes`,
  `time_estimates_source` (`igdb`, `ai` o `none`), `time_estimates_checked_at`; migración
  `20260906000000_games_time_to_beat.sql`) desde `getGameCardData`, con la misma escritura por
  service role que la descripción y el fondo. **`time_estimates_checked_at` es la marca de "ya
  preguntamos"**: con valor no se vuelve a consultar aunque los dos tiempos hayan quedado en
  NULL, que es lo que evita pegarle a IGDB en cada visita a la ficha de un juego que no está
  en su catálogo.
- **`IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET`** (gratis en dev.twitch.tv; son credenciales de
  app, el token de client credentials se cachea en memoria del proceso). La app de Twitch
  tiene que ser de tipo **Confidential**: una de tipo Público no tiene secreto, y el tipo no
  se puede cambiar después de crearla. Sin estas variables los tiempos salen todos del LLM
  (peor dato, y consumiendo el rate limit de Groq), así que si en la ficha todo aparece con
  el ✨ de IA, lo primero a mirar es si están cargadas en Vercel.

## Advisor con IA: `lib/ai/`

Igual patrón que `lib/psn/`: toda llamada al LLM vive acá, nunca directo en componentes ni rutas. Ver `PRODUCT_SPEC.md` sección 4 para el diseño completo (input/output esperado).

- `lib/ai/prompt.ts` — arma el system prompt y el prompt de usuario (juego + trofeos + guías propias ya cargadas, para que la IA no las contradiga).
- `lib/ai/client.ts` — `generateAiGamePlan()`, llama a la API de Groq (`groq-sdk`, modelo `openai/gpt-oss-120b`, free tier sin tarjeta) server-side con `response_format: { type: "json_object" }`. Si la respuesta no matchea el schema, reintenta **una sola vez** pidiéndole al modelo que corrija el JSON; si vuelve a fallar tira `AiSchemaValidationError` (nunca cachear ni devolver un 500 silencioso — el caller decide cómo mostrar "no se pudo generar").
- `lib/ai/schema.ts` — schema de Zod (`aiGamePlanSchema`) que valida la estructura exacta de la sección 4 del spec. Los `trofeo_id` del output son siempre el `id` (uuid interno de `trophies`), no el `trophy_id` texto que usa la API de PSN — así se puede cruzar directo con `user_trophies`/`guide_steps` sin una tabla de mapeo extra.
- `lib/ai/errors.ts` — `AiProviderError` (falló la llamada al proveedor) vs `AiSchemaValidationError` (la llamada anduvo pero el JSON no sirve); distinguirlos importa para decidir si vale la pena reintentar.
- **Estado actual: Fase 6 completa.** `app/juegos/[id]/ai-actions.ts` (`generateAiPlan`, Server Action — no API route, porque depende de la sesión de cookies del usuario igual que las guías) arma el input desde trofeos + `user_trophies` + guías propias, llama `generateAiGamePlan()` y siempre inserta una fila nueva en `ai_game_plans` (versionado: nunca pisa la anterior, `status` `ok`/`error`). `app/juegos/[id]/AiAdvisorPanel.tsx` (Client Component) muestra el último plan `ok` cacheado y expone el botón "Generar plan"/"Regenerar plan"; el label de "contenido generado por IA" está siempre visible en el panel, no solo en el resultado.
- El plan incluye `desafios_de_dificultad`: trofeos que exigen dificultad máxima, contrarreloj, no morir, permadeath o recursos limitados, cada uno con su `categoria`, el motivo y un consejo (típicamente "arrancá directo en la dificultad más alta para no rejugar"). El campo tiene `.default([])` en el schema de Zod a propósito: los planes ya guardados en `ai_game_plans` son de antes y tienen que seguir parseando sin regenerarse.
- Los chips de trofeo del panel son botones: al clickearlos llevan al trofeo en la lista de arriba y le abren la ayuda de "cómo desbloquearlo" ya cargada. El puente entre los dos Client Components (los monta `page.tsx`, que es Server Component) es un evento del DOM, `app/(app)/juegos/[id]/focusTrophy.ts`: `TrophyList` lo escucha, **limpia sus filtros** — si el trofeo estaba filtrado, su fila no está montada y no hay a dónde scrollear — y pasa un `focusToken` al `TrophyItem` correspondiente. En `TrophyItem` el token se compara durante el render (no con un `setState` en un `useEffect`, ver Convenciones de código); el `scrollIntoView` sí va en effect porque es DOM, no estado.
- Requiere `AI_PROVIDER_API_KEY` (API key de Groq, gratis en console.groq.com sin tarjeta) server-side, nunca `NEXT_PUBLIC_`. El free tier tiene rate limit bajo (30 req/min, 14.4k req/día a nivel organización) — si el advisor empieza a fallar con error 429, es eso, no un bug.

## Performance: lag general de la app

Diagnóstico (2026-08-19) sobre por qué la app se sentía lenta "en todos lados", no solo en el sync de PSN:

- **`middleware.ts` corría en cada request de toda la app** (matcher original excluía solo estáticos), haciendo `supabase.auth.getUser()` — un round-trip a Supabase Auth — antes de renderizar cualquier página, incluidas públicas. Ahora el `matcher` está acotado a las rutas que realmente dependen de sesión: `/perfil`, `/juegos`, `/psn`, `/diario`, `/login`, `/registro`, `/auth`. El resto de la app no paga ese costo. Cada página protegida sigue validando su propia sesión server-side además del middleware (redundante a propósito, no se tocó — ver convención de doble capa de autoría en guías).
- **Queries a Supabase en serie que no dependían entre sí**: `app/juegos/[id]/page.tsx` encadenaba con `await` game → trophies → user_trophies → plan de IA cacheado (solo dependen de la `membership` ya confirmada); `app/juegos/page.tsx` encadenaba psnAccount → library, y por separado trophies → user_trophies. Se pasaron a `Promise.all` donde no había dependencia real. `app/perfil/page.tsx` ya usaba `Promise.all` para su primer par de queries — quedó como estaba.
- **`next/image` con `unoptimized`** en `GameCard.tsx`, `TrophyItem.tsx` y `juegos/[id]/page.tsx`: estaba puesto porque `next.config.ts` no tenía `images.remotePatterns` configurado (Next rechaza hosts no whitelisteados). Se agregaron patterns para los hosts reales de donde vienen las imágenes (`*.playstation.com`, `*.rawg.io`, `*.steamgriddb.com`) y se sacó `unoptimized` — ahora Next sirve las carátulas/íconos resizeadas y en WebP/AVIF vía su optimizador, en vez del archivo original.
- Faltaba `loading.tsx` en `app/psn/` (sí existía en `/juegos`, `/juegos/[id]`, `/perfil`) — se agregó, mismo patrón que las demás rutas (`LoadingState`).
- **Ya resuelto (2026-08-20)**: lo de arriba se implementó. `get_library_trophy_stats()` (migración `20260820020000_library_trophy_stats_rpc.sql`) agrega total/obtenidos por juego y por tipo con `GROUP BY` en Postgres, `security invoker` + `auth.uid()` (respeta las RLS existentes, no hace falta service role). `juegos/page.tsx` y `perfil/page.tsx` llaman a este RPC en vez de paginar manualmente por miles de filas de `trophies`/`user_trophies`. `juegos/[id]/page.tsx` (una sola página de juego, no necesita agregación entre juegos) en cambio filtra `user_trophies` con `.in("trophy_id", trophyIds)` acotado a los trofeos de ese juego -- sin RPC, ya que ahí alcanza con no traer los trofeos de TODOS los demás juegos del usuario. Confirmado con la cuenta real del usuario que esto era el cuello de botella real (208 juegos / 10.284 trofeos / 2.076 desbloqueados hacían que `/juegos` tardara 4-7s de puro `application-code` en el server, incluso después de paralelizar queries).

Verificación manual: `npx tsc --noEmit` y `eslint` limpios sobre los archivos tocados; se levantó el dev server y se confirmó con `curl` que `/juegos`, `/psn` y `/perfil` siguen devolviendo 307 a `/login` sin sesión (el middleware acotado sigue protegiendo esas rutas), y que rutas públicas (`/`, `/registro`) cargan sin pasar por el middleware.

## Diseño visual: la app de Letterboxd como referencia

Decidido el 2026-09-05: **toda la app mobile sigue el lenguaje visual de la app de
Letterboxd**, que es coherente con que el diario ya se haya diseñado así desde el principio.
No se copian sus colores de marca (la paleta sigue siendo la de PRODUCT_SPEC.md §7: negros
azulados, acento PSN, oro de trofeo); se copia la **estructura**.

Tres primitivas, y todo lo demás se arma con ellas:

- `components/game/GamePoster.tsx` — la carátula es la unidad visual de la app. Las pantallas
  de navegar son grillas de pósters, no listas de texto. Sobre la carátula va **sólo** lo
  mínimo: una barra de progreso de 3px abajo y el badge de platino / 100% en una esquina. El
  número exacto, el desglose por tipo de trofeo y las horas viven en la ficha del juego.
  Es `aspect-[3/4]` y no el 2:3 de un póster de cine: las carátulas llegan de fuentes muy
  distintas (los íconos de PSN son cuadrados, las de RAWG apaisadas) y a 2:3 `object-cover`
  se comía media imagen.
- `components/game/PosterGrid.tsx` — `PosterGrid` (3 columnas en mobile, como Letterboxd),
  más `PosterRow`/`PosterRowItem` para los carruseles horizontales de las secciones donde el
  orden importa más que ver todo. El `PosterRow` lleva `scroll-pl-4` además del `px-4`: sin
  scroll-padding el snap del primer ítem ignora el padding y la fila arranca desplazada
  respecto de la grilla de al lado.
- `components/ui/SectionHeader.tsx` — versalitas chicas y espaciadas sobre una regla fina,
  con acción opcional a la derecha (`SectionAction`, el "VER TODO"). Reemplaza a los `<h2>`
  grandes: con la pantalla llena de carátulas, el título tiene que ordenar sin competir.

Las **tiras de estadísticas** (perfil y ficha de juego) son el otro patrón prestado: número
grande, etiqueta chica en versalitas, celdas separadas por 1px. En mobile van de 2 o 3 por
fila.

`components/game/GameDetailHero.tsx` (ficha de trofeos) y `components/diary/GameHero.tsx`
(ficha de diario) son primos: los dos hacen el wallpaper a ancho completo de la ventana con
el truco de `w-screen` + `left-1/2` + `-translate-x-1/2`. El de diario además muestra
descripción y puntuación de la comunidad; el de trofeos, la tira de progreso del usuario.
Los dos leen `getGameCardData` (`lib/catalog/details.ts`), así que abrir una ficha calienta
el caché de la otra.

`components/GameCard.tsx` (la fila de la biblioteca con progreso, horas y desglose por tipo)
**se eliminó**: la reemplazó la grilla de carátulas.

## App instalable en el celular (PWA)

Platinoob se instala en el celular desde el navegador — "Añadir a pantalla de inicio" /
"Instalar aplicación" — sin pasar por App Store ni Play Store. No hay build nativo ni
wrapper: es la misma app de Next, con manifest y service worker.

- `app/manifest.ts` (ruta de metadata de Next, se sirve en `/manifest.webmanifest`).
  `start_url` es `/juegos` y no `/`: quien instala ya tiene cuenta. Los íconos son PNG
  commiteados en `public/`, generados por `scripts/generate-icons.mjs` a partir del mismo
  trofeo que `app/icon.svg`; hacen falta los dos `purpose` (`any` y `maskable`, porque
  Android recorta hasta un 20% de cada borde).
- `public/sw.js` cachea **sólo** `/_next/static/` (nombres con hash, inmutables) y la
  pantalla `/offline`. **Nunca cachea HTML ni respuestas de API**: la app es toda contenido
  privado detrás de sesión, y servir una página cacheada de otro usuario sería un agujero de
  privacidad. Las navegaciones van siempre a la red, con `/offline` de fallback.
- `next.config.ts` sirve `/sw.js` con `Cache-Control: max-age=0, must-revalidate`. Sin eso
  Vercel lo cachea como cualquier archivo de `public/` y un service worker nuevo puede tardar
  días en llegar a los celulares que ya lo tienen instalado.
- iOS no lee el manifest: la configuración de la app instalada sale de los `appleWebApp` de
  `app/layout.tsx`. Next sólo emite el `mobile-web-app-capable` moderno, así que el alias
  `apple-mobile-web-app-capable` va a mano en `metadata.other`.
- El viewport es `viewport-fit=cover` (la app instalada pinta debajo del notch y de la barra
  de gestos): todo lo anclado a un borde compensa con las utilidades `pt-safe`/`pb-safe` de
  `app/globals.css`.

### Cómo se actualiza la app cuando mergeamos un PR

Una app instalada no se refresca sola como una pestaña: el usuario puede quedarse con el
bundle viejo por días. El mecanismo:

1. `next.config.ts` hornea el SHA del commit deployado (`VERCEL_GIT_COMMIT_SHA`) en el
   bundle del cliente como `NEXT_PUBLIC_BUILD_ID`.
2. `/api/version` (`app/api/version/route.ts`, `force-dynamic` + `no-store`) devuelve el
   build id del deploy que está vivo **ahora**.
3. `components/pwa/PwaRuntime.tsx` compara los dos al montar, cada vez que la app vuelve a
   primer plano y cada 5 minutos. Si difieren, muestra el cartel "Hay una versión nueva":
   vacía las cachés del service worker y recarga.

O sea: mergear el PR y esperar el deploy de Vercel alcanza, no hay nada que publicar aparte.
En local el build id es `"dev"` y el chequeo se saltea, para que el cartel no sea ruido
permanente.

La navegación de mobile es la barra inferior de tabs (`app/(app)/MobileTabBar.tsx`, sólo
debajo de `sm`); el header conserva la nav en escritorio. Los dos leen `app/(app)/nav-links.ts`
para no desincronizarse. El header **no** es `sticky`: la ficha de juego tiene su propia
barra `sticky top-0` y las dos se pisarían.

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
- `steam_accounts` — vínculo user ↔ Steam (steam_id64, persona_name, avatar, visibilidad del perfil,
  última sync). Planeado, ver sección de Steam arriba.
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
- **Los juegos `source='catalog'` no se listan en la biblioteca** (`/juegos`) ni cuentan en
  "Juegos en biblioteca" del perfil: viven solo en el diario. Se siguen vinculando en
  `user_games` (por eso `/juegos/[id]` los abre igual, que es lo que necesita el diario), el
  filtro es de presentación, no de datos.
- `/diario` (issue #93) es el timeline cronológico propio del usuario: `lib/diary/queries.ts`
  (`getUserDiaryEntries`, server-only) trae las entradas con el juego, y
  `components/diary/DiaryTimeline.tsx` agrupa por mes/año y filtra por año/plataforma/rating
  **client-side** (el diario propio es un dataset chico; así no hay round-trip por filtro).
  El badge de platino no sale de la tabla — `game_diary_entries` no tiene `is_platinum` — se
  deriva de los trofeos sincronizados, así una entrada de un juego de catálogo simplemente
  queda sin badge.
- `/diario/resumen` (issues #94/#97) es el "Year in Review": `lib/diary/stats.ts` son funciones
  puras sobre las mismas entradas que trae `getUserDiaryEntries`, así los números no pueden
  divergir de `/diario`. Las fechas se parsean cortando el string `YYYY-MM-DD`, nunca con
  `new Date(...)` (correría a UTC y podría mover el mes). La racha de meses consecutivos es
  histórica a propósito, no por año.
- La ficha del juego (`/juegos/[id]`) tiene su propia sección de diario (issue #95):
  `getGameDiarySummary` + `components/diary/GameDiarySection.tsx` (score, distribución 1-5,
  historial propio y acceso a registrar/editar). La distribución cuenta el último rating de
  cada usuario, mismo criterio que la vista `game_scores`.
- **Auto-detección de platino** (issue #96): `lib/diary/platinum.ts`
  (`reconcilePlatinumDiaryEntry`) aplica la regla ±14 días sobre `finished_on`; si hay una
  entrada cercana le escribe `platinum_earned_at` (nunca pisa rating ni reseña), y si no hay
  ninguna crea una con `source = 'platinum_sync'` que el usuario puede editar después para
  puntuar y reseñar. Lo llama `lib/psn/sync.ts` dentro de un try/catch: es un extra, no puede
  tirar abajo el sync de trofeos. Migración `20260822020000_diary_platinum_sync.sql`.
- Los platinos **viejos** (ya en `user_trophies` de syncs anteriores al hook) se importan con
  el botón "Importar mis platinos" de `/diario` (`lib/diary/backfill.ts` +
  `app/(app)/diario/actions.ts`). No llama a PSN: la fecha ya está guardada localmente. Reusa
  `reconcilePlatinumDiaryEntry`, así que es idempotente.
- **Reconciliación catálogo → PSN**: si un juego cargado antes desde el catálogo aparece
  después en el sync real, `adoptCatalogGame` (en `lib/psn/sync.ts`) adopta esa fila
  (le escribe `np_comm_id` y `source = 'psn'`) en vez de crear un duplicado en `games`, así no
  se pierden las entradas de diario ya cargadas. Solo funciona sobre filas propias
  (`created_by`), que es lo que deja actualizar la RLS de `games`.
- `/diario` muestra primero el feed corto de amigos (`FriendsDiaryGrid`, grilla de carátulas
  con las últimas 10 partidas, cada una linkeando al diario de ese juego donde está la reseña)
  y después el timeline propio: el propio crece sin techo y empujaba el feed fuera de pantalla.
  La actividad completa de amigos (lista con reseñas, `FriendsDiaryFeed`) vive en
  `/diario/amigos`.
- El fondo de `GameHero` es un backdrop a ancho completo de la ventana (w-screen + left-1/2 +
  -translate-x-1/2, con degradado al color de la página), tipo Letterbox. El wallpaper sale, en
  orden, de RAWG, del "hero" de SteamGridDB (`findHeroImageUrl`) y de la CDN pública de Steam
  (`findSteamHeroUrl`: `library_hero.jpg` del appid resuelto con la búsqueda pública de la
  store, **sin ninguna API key** -- por eso funciona aunque falten `RAWG_API_KEY` y
  `STEAMGRIDDB_API_KEY`). Si no hay ninguno, cae a la carátula difuminada. El backdrop va con
  `z-0` y el contenido con `z-10`: con `-z-10` quedaba detrás del `bg-zinc-950` de la página y
  no se veía.
- **Galería de capturas** (`game_screenshots` + bucket `game-screenshots`, migración
  `20260823000000_game_screenshots.sql`): las sube el usuario a mano. Sony **no expone la
  galería de capturas de PSN** por ninguna API usable — `psn-api` no la cubre y el GraphQL
  interno de la PS App cambia sus hashes de `persistedQuery` en cada release, así que no se
  intentó. Las capturas son públicas igual que el diario (`select using (true)`), y solo el
  dueño puede escribir/borrar.
  El archivo va **directo del browser a Storage** con la sesión del usuario (un Server Action
  tiene límite de body y una captura pesa varios MB); recién después
  `registerScreenshots` (`app/(app)/juegos/[id]/diario/screenshot-actions.ts`) indexa el path
  en la tabla. Por eso el control real de quién escribe qué es la policy de `storage.objects`:
  la primera carpeta del path tiene que ser el uuid del usuario
  (`${userId}/${gameId}/${uuid}.ext`, ver `buildScreenshotPath`), y la Server Action revalida
  ese prefijo antes de insertar — doble capa, misma convención que la autoría de guías.
  Si el insert falla, la action borra el objeto ya subido para no dejar archivos huérfanos.
  Al borrar se hace al revés (primero la fila, después el archivo): una fila apuntando a un
  archivo inexistente sería una imagen rota en una galería pública.
  Límites (`lib/diary/screenshot-constants.ts`, compartidos entre client y server) están
  duplicados a propósito en el bucket (`file_size_limit`/`allowed_mime_types`): Storage rechaza
  la subida antes de que el server vea nada, así que si se cambian hay que cambiarlos en los
  dos lados. El bucket es público, así que la URL sale de `getPublicUrl` (no hay signed URLs
  que expiren) y `next.config.ts` whitelistea `*.supabase.co` para que pase por `next/image`.
  UI: `ScreenshotUploader` (multi-archivo con preview local en `blob:`, por eso ese `<img>` va
  sin `next/image`) + `ScreenshotGallery` (grilla tipo Instagram con lightbox sobre `Modal`),
  ambos en `/juegos/[id]/diario`.
- **Importación masiva** (`/diario/capturas`): como no hay import automático posible, lo que
  reemplaza a "traer las fotos de PSN" es soltar la carpeta que la consola exporta al USB y
  que cada archivo caiga solo en su juego. La consola escribe el título en la ruta
  (`PS5/CREATE/Screenshots/<Juego>/<Juego>_20230115121314.jpg`, `PS4/SHARE/Screenshots/...`),
  así que `lib/diary/screenshot-import.ts` deduce el nombre de la **carpeta** primero (más
  confiable que el nombre de archivo, y sobrevive a los renombres del navegador) y lo cruza
  con la biblioteca por `normalizeName` — el mismo criterio que el dedup de catálogo, con las
  mismas limitaciones (un remaster puede no matchear). Es un módulo **puro y sin
  `server-only`** a propósito: corre en el cliente y se testea directo desde el spec, igual
  que `steam-relevance`. Dos detalles que importan: el recorte del sufijo de fecha exige la
  fecha completa (8 dígitos), porque recortar cualquier grupo final de números convertía
  "Battlefield 2042" en "Battlefield"; y las capturas que baja la PS App tienen nombre opaco,
  así que caen en un grupo "sin juego detectado" que el usuario asigna a mano (o deja en
  "— No importar —"). El drop de una carpeta se recorre con `webkitGetAsEntry` para conservar
  la ruta relativa; el `<input webkitdirectory>` es el camino equivalente con el picker.
  La Server Action es `app/(app)/diario/capturas/actions.ts`
  (`registerImportedScreenshots`): mismo contrato que `registerScreenshots` — el archivo sube
  directo del browser a Storage y la action sólo indexa paths, revalidando que el prefijo sea
  el uuid del usuario — pero abarcando varios juegos por llamada, con tope
  `MAX_SCREENSHOTS_PER_IMPORT`.
- **El caché de la ficha se escribe con service role** (`persistGameCardData` en
  `lib/catalog/details.ts`). La RLS de `games` sólo deja actualizar las filas propias
  (`created_by`), así que con el cliente de sesión la descripción, el fondo y la carátula
  **nunca se guardaban** para un juego que había sincronizado otro usuario: cada visita
  volvía a pegarle a RAWG/SteamGridDB/Groq y, si alguna de esas respuestas fallaba o tardaba,
  la ficha aparecía sin fondo (y la siguiente visita sí lo mostraba). Son datos públicos del
  catálogo compartido, mismo criterio que `lib/external-guides/`. Si falta
  `SUPABASE_SERVICE_ROLE_KEY` se cae al cliente del usuario en vez de romper.
- `getGameCardData` también completa `cover_url` cuando la fila sólo tiene el `icon_url` de
  PSN (el ícono cuadrado del set de trofeos, que estirado al póster 3:4 se ve pixelado).
- **Todo el arte de juego va por `components/game/GameArt.tsx`**, no por `next/image` directo
  (carátulas, wallpapers, íconos de trofeo, resultados del buscador de catálogo). Hace dos
  cosas: sirve la imagen **sin pasar por el optimizador de Vercel** (`unoptimized`) y cae a un
  placeholder si no carga.
- **Por qué `unoptimized`**: el plan Hobby de Vercel incluye 5.000 transformaciones de imagen
  por mes y esta app las quema en días (cientos de carátulas × varios tamaños, más un ícono
  por trofeo y son más de 10.000). Cuando la cuota se agota Vercel deja de servir
  `/_next/image` y **todas** las imágenes desaparecen de golpe, en todos los dispositivos a la
  vez -- pasó el 2026-09-05 con la cuota en 5.1K/5K. Encima no ganábamos casi nada:
  lo que servimos ya son JPG/PNG comprimidos de las CDNs de RAWG, Steam y PSN, pensados para
  mostrarse a este tamaño. Esto revierte a propósito una parte de la pasada de performance de
  2026-08-19 (sacar `unoptimized`): el ahorro de bytes no compensa que la app se quede sin
  imágenes. **Las capturas que suben los usuarios (`ScreenshotGallery`) sí se siguen
  optimizando**: ahí el original pesa megas y la transformación se paga sola.
- El score comunitario se muestra con `components/diary/GameScore.tsx`, que con menos de
  `MIN_RATINGS_FOR_AVERAGE` (3) valoraciones muestra "todavía sin suficientes valoraciones" en
  vez del promedio, para que un voto solo no defina el score de un juego (issue #92).
- La ficha de diario de un juego (`/juegos/[id]/diario`) es la vista tipo Letterbox:
  `components/diary/GameHero.tsx` (fondo, carátula grande, año/plataforma/desarrolladora,
  descripción y distribución de valoraciones). Los datos externos salen de RAWG
  (`fetchGameDetails`/`findGameDetailsByName` en `lib/covers`) y se cachean en `games`
  (`description`, `developer`, `release_year`, `background_url`, migración
  `20260822030000_games_catalog_details.sql`, más `description_source`) la primera vez que
  alguien abre la ficha:
  `lib/catalog/details.ts` solo consulta RAWG si la fila todavía no los tiene, y guarda
  `description = ''` cuando RAWG no encuentra nada para no reintentar en cada visita. Si la
  RLS de `games` bloquea el update (el juego lo creó otro usuario), igual se muestran los
  datos recién traídos. Cuando RAWG no tiene descripción se genera una con Groq
  (`generateGameDescription` en `lib/ai/`, prompt que responde `NO_CONOZCO` en vez de
  inventar) y se guarda con `description_source = 'ai'`; la ficha lo aclara con "Descripción
  generada por IA". El fondo tipo wallpaper sale del "hero" de SteamGridDB
  (`findHeroImageUrl`) y cae a la imagen de RAWG si no hay. Todo opcional: sin
  `RAWG_API_KEY`/`STEAMGRIDDB_API_KEY`/`AI_PROVIDER_API_KEY` la ficha se muestra igual, más
  pelada.
- El buscador de "Marcar como terminado" (`CatalogSearchCombobox`) dispara solo con debounce a
  partir de `MIN_QUERY_LENGTH` (`lib/catalog/constants.ts`, 3 caracteres) — la constante vive
  fuera de `lib/catalog/actions.ts` porque un módulo `"use server"` solo puede exportar
  funciones async. Cuando el query queda por debajo del mínimo, los resultados viejos se
  ocultan **derivándolos durante el render**, no con un `setState` dentro del effect (regla
  `react-hooks/set-state-in-effect`, ver Convenciones de código).

## Recomendaciones del diario (`ai_recommendations`)

Sección "Recomendados para vos" en `/diario`, debajo del feed de amigos: qué **seguir jugando**
de la propia biblioteca (juegos empezados y sin platinar) y qué **juegos nuevos** probar, todo
inferido por IA a partir de los juegos ya platinados (PSN) o al 100% (Steam).

- El ranking lo decide el modelo, no una heurística local: `lib/ai/prompt.ts`
  (`AI_RECOMMENDATIONS_SYSTEM_PROMPT` + `buildAiRecommendationsUserPrompt`),
  `lib/ai/schema.ts` (`aiRecommendationsSchema`) y `generateAiRecommendations` en
  `lib/ai/client.ts`, con el mismo contrato que el advisor de un juego: un reintento si el JSON
  no valida y `AiSchemaValidationError` si vuelve a fallar.
- `lib/diary/recommendations.ts` arma el input desde `user_games` + `get_library_trophy_stats()`
  (mismo RPC que `/juegos`, no se pagina a mano) y reusa `isVisibleInLibrary` para no colar
  juegos de catálogo ni basura de Steam. La biblioteca en curso se manda **recortada** a los 30
  más avanzados: una biblioteca real pasa el límite de tokens del free tier de Groq.
- Al modelo se le pasan **ids cortos** (`g1`, `g2`, ...) y el caller los remapea al uuid real,
  igual que los trofeos del plan; una recomendación con un id inventado se descarta antes de
  guardarse en vez de quedar apuntando a nada.
- Se guarda versionado en `ai_recommendations` (migración `20260826000000_ai_recommendations.sql`,
  RLS "solo el dueño"): cada generación inserta una fila nueva y la UI muestra la última `ok`,
  así una regeneración fallida no borra la anterior. La Server Action es
  `app/(app)/diario/recommendation-actions.ts` (depende de la sesión de cookies, no va como API
  route) y hace `revalidatePath("/diario")`: por eso `RecommendationsSection.tsx` renderiza la
  lista desde las props del server y usa estado local solo para el error y el pending.
- Los juegos de "Para probar" no existen en `games` (el usuario no los tiene), así que van como
  tarjetas de texto y no como grilla de carátulas: no hay ficha adónde linkear.

## Amigos y feed "Jugados por amigos" (`friendships`, `public_profiles`)

- La relación es **unidireccional y sin aceptación** (más "seguir" que "solicitud de amistad"):
  el diario ya es público (`game_diary_entries` tiene `select using (true)`), así que agregar a
  alguien no da acceso a nada nuevo — solo decide qué aparece en tu feed. Migración
  `20260822010000_friends.sql`.
- `public_profiles` es una vista **SECURITY DEFINER a propósito** (sin `security_invoker`, a
  diferencia de `game_scores`/`get_library_trophy_stats`): expone `online_id`/`avatar_url` de
  `psn_accounts`, cuya RLS es "solo el dueño". Lista **solo** columnas públicas — nunca
  `npsso_encrypted`, `account_id` ni el email — y tiene `grant select` únicamente a
  `authenticated` (`revoke all` para `anon`). Si se le agregan columnas, revisar eso.
- `lib/friends/queries.ts` (server-only) tiene `getFriends` y `getFriendsDiaryFeed`;
  `lib/friends/actions.ts` (Server Actions) tiene `searchUsers` (sin query lista a todos los
  usuarios, con query filtra por PSN o `display_name`), `addFriend` (upsert, para que
  re-agregar no falle con 23505) y `removeFriend`.
- En el feed de amigos **no se muestra el badge de platino**: se deriva de `user_trophies`, que
  es privado, así que desde la sesión del que mira no se puede saber.
- La app todavía no tiene un lugar para editar `users.display_name`, así que un usuario sin
  cuenta PSN conectada aparece como "Usuario sin nombre" en el buscador (`profileLabel` en
  `lib/friends/constants.ts` prioriza el `online_id` de PSN).
- `components/Modal.tsx` es el modal genérico compartido (Escape / ✕ / click afuera, bloquea el
  scroll del body); lo usan "Marcar como terminado" y "Agregar amigo".

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

## Testing: regla obligatoria para todo cambio

**Toda funcionalidad nueva o cambio de comportamiento entra al repo con sus tests
automáticos, y esos tests corren en GitHub Actions al abrir el PR.** No es opcional ni se
deja "para después": un PR sin tests para lo que agrega está incompleto.

- **Qué escribir**: tests E2E con Playwright siguiendo `TESTING_PRD.md` al pie de la letra —
  estructura de carpetas (`e2e/specs/`), prioridad de selectores (rol accesible → label →
  `data-testid` como último recurso), cero `waitForTimeout`, y el título del test arrancando
  con el ID del caso de la matriz (`GUIDE-05: ...`). Si el cambio no encaja en ningún caso
  existente, **primero se agrega la fila a la matriz de `TESTING_PRD.md`** y recién después
  se escribe el test.
- **Dónde corren**: `.github/workflows/e2e.yml` ya dispara la suite en cada `pull_request`.
  Si el cambio necesita un secret, una variable de entorno o un paso nuevo en CI, se agrega
  al workflow **en el mismo PR** — un test que solo pasa en local no cuenta como cubierto.
- **Mocks, no red real**: las integraciones externas (PSN, Groq, RAWG, SteamGridDB, Steam) se
  mockean con el interruptor `E2E_MOCKS=1`, que se lee **solo dentro de `lib/**`**, nunca en
  componentes, páginas ni Server Actions. Sony bloquea el intercambio de NPSSO desde IPs de
  datacenter, así que en CI un NPSSO real no funciona nunca — no intentar ese camino. La
  verificación contra las APIs reales va etiquetada `@live` y se corre a mano
  (`npm run e2e:live`); un `@live` en rojo se investiga, pero no bloquea el merge.
- **Los datos de test se limpian solos**: la suite escribe en el proyecto Supabase real, así
  que todo lo que crea lleva prefijo (`[E2E]` / `E2E-%`) y lo borra el teardown. Ningún test
  puede tocar datos preexistentes, asumir un `game_id` fijo ni depender del estado que dejó
  otro test.
- **Un `data-testid` es un cambio de producción**: va en el mismo PR que el test que lo usa,
  nunca por adelantado, y se registra en la tabla de `TESTING_PRD.md` sección 7.5.
- **Antes de pedir review**: `npx tsc --noEmit`, `npm run lint` y `npm run e2e` en verde.

## Convenciones de código

- TypeScript estricto, sin `any` salvo en boundaries de librerías externas.
- Toda llamada a `psn-api` vive en `lib/psn/`, nunca directo en componentes ni en rutas sueltas; toda llamada al LLM vive en `lib/ai/`, mismo criterio (ver arriba).
- Server Components por defecto; Client Components solo donde haya interactividad real.
- Variables sensibles (NPSSO, service role key de Supabase, API key de IA) solo en variables de entorno server-side, nunca prefijo `NEXT_PUBLIC_`.
- Los módulos server-only (`lib/psn/*`, `lib/ai/*`) arrancan con `import "server-only";` para que Next tire error de build si algo los importa desde un Client Component por accidente.
- Mutaciones desde la UI van como Server Actions (`"use server"` en `actions.ts` junto a la página, `useActionState` del lado del cliente) — es el patrón usado en `app/(app)/juegos/[id]/enlaces/` y `app/(app)/juegos/[id]/diario/`, no API routes salvo que la lógica no dependa de la sesión de cookies del usuario (ej. `app/api/psn/sync`, que declara `maxDuration`).
- **Regla de lint (`react-hooks/set-state-in-effect`)**: no llamar a un setter de `useState` dentro de un `useEffect` para sincronizar con el resultado de una Server Action (ej. cerrar un form de edición cuando `useActionState` devuelve éxito). En vez de eso, comparar el `state` actual contra una copia guardada con `useState` y, si cambió, ajustar el estado **durante el render** (patrón oficial de React, no dispara el lint). Ver `EditGuideForm.tsx`/`EditStepForm.tsx` para el ejemplo de referencia.
- Autoría/edición de contenido de usuario (guías) siempre se valida en dos capas: en la Server Action (`assertOwnsGuide` o `.eq("author_id", user.id)` en la query) **y** en la policy de RLS correspondiente — ninguna alcanza sola como única defensa.

## Roadmap sugerido

1. Auth + esquema base en Supabase. ✅
2. Conexión de cuenta PSN (input de NPSSO) + primer sync manual de trofeos. ✅
3. Vista de perfil: juegos, % completitud, trofeos por juego. ✅
4. Sync automático (cron) + manejo de expiración de token. ✅ (`app/api/cron/sync/`, ver detalle abajo). El disparo manual (`/api/psn/sync`) sigue existiendo para el primer sync y para reconectar tras un NPSSO vencido.
5. ~~Guías propias (CRUD simple) ligadas a juegos/trofeos.~~ Eliminado: la pantalla se borró (ver arriba); las tablas quedan y las lee el advisor.
6. ~~Checklist de guía cruzada con trofeos ya obtenidos.~~ Eliminado junto con la pantalla de guías.
7. Enlaces a guías externas curadas. ✅ campo (`external_url`/`source`) dentro de una guía + vista dedicada de "enlaces por juego" (`app/juegos/[id]/enlaces/`), Fase 9 completa.
8. Advisor con IA (`lib/ai/`): cliente + prompt + validación de schema + endpoint + UI del panel + guardado versionado en `ai_game_plans`. ✅ Fase 6 completa.
9. Letterbox de juegos: diario público de partidas terminadas con rating, buscador de catálogo (RAWG) para loguear cualquier juego de PSN aunque no esté sincronizado. ✅ Fase 12 completa (issues #88-93: `game_diary_entries`/`game_scores`, `lib/covers` búsqueda multi-resultado, `lib/catalog/` alta de juegos, CRUD en `app/juegos/[id]/diario/`, timeline en `/diario`, score comunitario con umbral de 3 votos).
10. Steam como segunda plataforma conectable. ✅ Fase 13 completa (issues #110-#119):
    `lib/steam/`, `steam_accounts`, Configuración › Conexiones, `/api/steam/sync`, filtro de
    fuente en la biblioteca, stats por plataforma, cron compartido, diario al 100% y Steam
    OpenID. Ver la sección de Steam más arriba y `PRODUCT_SPEC.md` sección 12.

Ver `PRODUCT_SPEC.md` para el detalle completo de fases (0-13), decisiones de producto y Definition of Done por issue — este roadmap es el resumen corto.

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
IGDB_CLIENT_ID=
IGDB_CLIENT_SECRET=
CRON_SECRET=
```

- `PSN_TOKEN_ENCRYPTION_KEY`: requerida para conectar cuentas PSN (cifra el NPSSO en reposo). 32 bytes en base64 — generar con `openssl rand -base64 32`.
- `AI_PROVIDER_API_KEY`: requerida para el advisor con IA (`lib/ai/`). API key de Groq (console.groq.com), gratis sin tarjeta. Sin ella, tira error al primer llamado — no rompe nada más de la app porque no se invoca en el sync ni en el render de páginas. `lib/external-guides/` (enlaces externos) no depende de esta key: usa Steam Web API + links de búsqueda, gratis, sin IA.
- `RAWG_API_KEY`: opcional. Sin ella, `lib/covers` no completa carátulas y el sync sigue funcionando igual con los íconos que trae PSN.
- `STEAMGRIDDB_API_KEY`: opcional. Fallback de `lib/covers` cuando RAWG no encuentra la carátula (o falta `RAWG_API_KEY`). Sin ninguna de las dos, el sync sigue funcionando igual con los íconos que trae PSN.
- `STEAM_API_KEY`: opcional para las guías, **requerida para conectar y sincronizar Steam**. Gratis en steamcommunity.com/dev/apikey. Sin ella, `lib/external-guides/steam.ts` no trae guías de Steam Community (los links de búsqueda a PowerPyx/PSNProfiles/TrueTrophies siguen funcionando) y `lib/steam/` tira `SteamApiKeyMissingError` en el primer llamado, que la UI de Conexiones muestra como mensaje propio en vez de un error genérico. Es la credencial de la app, no del usuario: no hay equivalente al NPSSO ni nada que expire.
- `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET`: requeridas para los tiempos estimados de juego (`lib/time-to-beat/`). Gratis en dev.twitch.tv/console/apps (una "aplicación" de Twitch; el secret se genera una vez y no se puede volver a ver). Sin ellas la ficha no muestra la sección de tiempos — no hay fuente alternativa, ver la sección de `lib/time-to-beat/`.
- `CRON_SECRET`: requerida para que `/api/cron/sync` acepte invocaciones. Vercel la agrega sola como header en las llamadas que dispara desde `vercel.json` si está seteada en el proyecto — sin ella el cron queda deshabilitado (401 siempre) pero el sync manual (`/api/psn/sync`) no se ve afectado.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
