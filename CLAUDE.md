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
- **`npsso_encrypted` no es legible para `authenticated`** (issue #130, migración `20261002010000_revoke_npsso_select.sql`): `syncTrophiesForUser` lo lee y `connectPsnAccount` lo escribe con `createServiceClient()`. El select de `psn_accounts` se da **columna por columna** (revocar una columna sola no tiene efecto mientras exista el grant de tabla), así que una columna nueva que la app tenga que leer necesita su propio `grant select (col)`.
- El NPSSO expira (históricamente ~2 meses de inactividad). El flujo debe soportar reconexión: si el sync falla por token vencido, avisar al usuario para que vuelva a pegar un NPSSO nuevo.
- Como es una API no oficial, **puede cambiar o cortarse sin aviso**. El diseño debe aislar todas las llamadas a PSN detrás de una capa (`lib/psn/`) para poder adaptarse rápido si algo rompe.
- Respetar rate limits razonables (no hacer polling agresivo; sync programado, no en cada request del usuario).
**Estado actual: la integración con PSN está de vuelta** (`lib/psn/`, `/psn`, `/api/psn/sync`). Es la única fuente de juegos y trofeos — no hay carga manual en la app; todo sale del sync con la cuenta PSN real del usuario.

- `getProfileFromAccountId` **no acepta el alias `"me"`** (arma la URL como `/v1/share/profile/:accountId` sustituyendo el valor literal). `lib/psn/auth.ts` saca el `accountId` numérico de `getUserTrophyProfileSummary(auth, "me")` primero y recién ahí llama a `getProfileFromAccountId` con ese id. Este era el bug real que rompía la conexión con un `"Unexpected Error"` genérico.
- Se sospechaba que **Sony bloquea el intercambio de NPSSO desde IPs de datacenter** (Vercel/AWS). **Nunca se confirmó** y no se implementó proxy (`PSN_PROXY_URL`) — el bug del alias `"me"` alcanza para explicar el fallo original. Si el sync falla específicamente en producción (Vercel) pero funciona en local con el mismo NPSSO, ahí sí vale la pena investigar un proxy saliente (`undici`'s `ProxyAgent`) antes de asumir que es el único camino.
- **El catálogo compartido (`games`, `trophies`, `trophy_groups`) lo escribe el sync con service role** (issue #164, migración `20261011000100_catalog_write_service_only.sql`): `authenticated` no edita ni borra nada de esas tablas — antes quien sincronizaba primero un juego podía renombrarlo o borrarlo por PostgREST, y el `on delete cascade` se llevaba los trofeos y el diario de todos. Con sesión sólo se inserta un juego `source = 'catalog'` sin `np_comm_id` ni `steam_appid` (`addCatalogGame`). `syncTrophiesForUser`/`syncSteamAchievementsForUser` usan un cliente `catalog` (service role) para esas tablas y el cliente recibido para lo del usuario (`user_games`, `user_trophies`, diario, cuenta). `created_by` ya no da permisos, pero sigue decidiendo **quién reescribe las filas compartidas**: PSN devuelve nombres y descripciones en el idioma de cada cuenta, así que sólo el sync de quien dio de alta el juego hace `ON CONFLICT DO UPDATE` sobre `trophies`/`trophy_groups`; los demás hacen `DO NOTHING` y sólo agregan lo que falta (un DLC nuevo). Sin eso la lista cambiaba de idioma según quién sincronizó último. `adoptCatalogGame` también lo usa como filtro para no adoptar la fila de otro.
- **El primer sync real puede tardar** (varias decenas de juegos, cada uno con su propia consulta a PSN) y en Vercel eso se traduce en `FUNCTION_INVOCATION_TIMEOUT` si no se lo tiene en cuenta. `lib/psn/sync.ts` procesa títulos con concurrencia limitada (`lib/psn/concurrency.ts`) y hace los inserts/upserts de trofeos en bloque por título en vez de uno por uno (antes eran hasta 2 round-trips a la base *por trofeo*, lo cual escalaba fatal con bibliotecas grandes). `app/api/psn/sync/route.ts` declara `export const maxDuration = 300`, pero en el plan Hobby de Vercel el límite real sigue siendo 60s pase lo que declare la ruta — si el sync sigue dando timeout en producción con eso, el plan de Vercel es la causa más probable, no el código.
- **Horas jugadas**: `lib/psn/playtime.ts` trae el `playDuration` de `getUserPlayedGames` (ISO 8601, ej. `"PT228H56M33S"`) y lo guarda en `user_games.playtime_minutes`, la misma columna que ya llenaba Steam. Esa lista está indexada por `titleId` (`CUSA…`/`PPSA…`) y los trofeos por `npCommunicationId` (`NPWR…`), y Sony no publica un mapeo entre las dos: el cruce es **por nombre normalizado**, con las mismas limitaciones que `adoptCatalogGame` (remasters y ediciones pueden no matchear). Es una sola llamada paginada por biblioteca, no una por juego, y va en un `.catch` — si el endpoint falla o cambia, el sync de trofeos sigue. Cuando un título no matchea, la columna **ni se menciona en el upsert**, para no pisar con NULL un valor ya guardado. Las horas de PSN y las de Steam **no son comparables** (Steam cuenta el proceso abierto; PSN, sesiones de consola desde que empezó a trackearlas): se muestran por juego, nunca sumadas entre plataformas. El formato es `lib/playtime.ts` (`formatPlaytime`), compartido por la tarjeta de la biblioteca y el hero de la ficha (`GameHero`). Dos detalles del endpoint que costaron una corrida real: hay que **pedir las `categories` explícitamente** (`ps4_game,ps5_native_game,pspc_game,unknown` — el default deja afuera media biblioteca) y el corte de la paginación **no puede ser `titles.length < limit`**, porque PSN devuelve páginas más chicas que el limit pedido y con eso se cortaba en la primera página (solo quedaban con horas los últimos juegos jugados). El sync loguea un resumen (`[psn-sync] horas jugadas: N títulos devueltos…`) para poder ver si el cruce por nombre está fallando sin tener que mirar la base.
- **Freno de frecuencia** (issue #128, `lib/sync/cooldown.ts`, puro): `POST /api/psn/sync` responde 429 (con `Retry-After`) si `psn_accounts.last_synced_at` tiene menos de 10 minutos, y `SyncButton` queda deshabilitado mostrando cuánto falta. `generateAiPlan` permite un plan `ok` por juego cada 5 minutos por usuario (los fallos no cuentan, para poder reintentar) y devuelve el plan anterior junto al aviso. **El cron no pasa por la ruta manual y no queda sujeto al límite.** El sync de Steam, las recomendaciones y los enlaces externos tienen el suyo desde #159. La ayuda de un trofeo (`explainTrophy`) no guarda nada, así que cada pedido deja una fila en `ai_usage` (#235) **antes** de llamar a Groq, vía `claim_ai_usage`: una función `security definer` que cuenta y anota en un solo paso con un lock por usuario (contado y anotado por separado, N pedidos en paralelo pasaban todos) y aplica `TROPHY_HINT_LIMITS` (10 por minuto, 100 por día). El pedido frenado no se anota. `authenticated` no inserta, edita ni borra en `ai_usage` (así `created_at` es siempre `now()` y nadie resetea su freno), y el cron borra las filas de más de 2 días (`?paso=ia` corre sólo eso).
- `lib/covers/index.ts` (RAWG, vía `RAWG_API_KEY`) sólo complementa la carátula (`cover_url`) cuando se crea un juego nuevo por sync; nunca aporta trofeos ni bloquea el sync si falla.
- **Sync automático**: `app/api/cron/sync/route.ts` corre vía Vercel Cron (`vercel.json`, diario) y sincroniza todas las `psn_accounts` con `token_status = 'valid'`, con la misma concurrencia limitada que el sync manual. Usa `lib/supabase/service.ts` (service role, bypassea RLS) porque no hay sesión de cookies de usuario en un cron; nunca usar ese cliente en una ruta que sirve requests de usuarios. El endpoint exige `Authorization: Bearer ${CRON_SECRET}` (Vercel lo manda solo si `CRON_SECRET` está seteada en el proyecto) — sin esa variable, el endpoint rechaza todo con 401. La comparación es en tiempo constante (`lib/cron/auth.ts`, SHA-256 + `timingSafeEqual`) y la respuesta sólo trae conteos y errores por plataforma, nunca `userId` (#133). Si una cuenta falla (NPSSO vencido, error de PSN), no aborta el resto: se guarda por-cuenta en la respuesta y `psn_accounts.token_status` queda en `'expired'` para que la UI le pida al usuario reconectar.

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
`/configuracion/conexiones`, y el matcher de `proxy.ts` (acotado a mano, ver sección de
performance) ya cubre `/configuracion`. Desde el epic #183 Configuración **no es un tab**: se
llega por el engranaje del perfil (mobile) o el menú de la cuenta (escritorio). Las Server Actions de las dos plataformas viven en
`app/(app)/configuracion/conexiones/actions.ts`; las tarjetas son
`components/connections/`. Desconectar **no borra** juegos ni trofeos ya sincronizados: son
del usuario y el diario cuelga de ellos.

## Content-Security-Policy con nonce (issue #222)

`lib/security/csp.ts` (puro) arma la política y `proxy.ts` la pone en el request (Next
extrae el nonce de ahí y se lo agrega a sus scripts) y en la respuesta. `script-src` es
`'self' 'nonce-…' 'strict-dynamic'`, **sin `'unsafe-inline'`** (`'unsafe-eval'` sólo en dev).
`style-src` sí lleva `'unsafe-inline'` (los `style="…"` que React renderiza en el server no
aceptan nonce) e `img-src` acepta `https:` más los dos hosts http de avatares de PSN: el arte
sale de muchas CDNs con `unoptimized` y un host nuevo quedaría como placeholder sin aviso.
`connect-src`/`media-src` suman el origen de Supabase. Como el nonce es por request,
**`app/layout.tsx` hace `await connection()` y no hay páginas prerenderizadas**: una página
estática saldría con scripts sin nonce y el navegador la dejaría sin hidratar. Si se agrega un
script de terceros o un host nuevo (fetch del cliente, video), se suma en `csp.ts`.

## Guías de desbloqueo: enfoque

No existe una API de "guías de trofeos". Dos caminos, no excluyentes:

1. **Curación propia**: guías escritas/editadas dentro de la app (markdown), asociadas a `game_id` / `trophy_id`. Es el contenido más confiable y evita temas de scraping.
2. **Enlaces a fuentes externas**: guardar links a guías existentes (PowerPyx, PSNProfiles, TrueTrophies, foros, YouTube) en vez de copiar su contenido. Citar siempre la fuente. **No scrapear sitios de terceros sin revisar sus términos de uso** — si se integra algo automatizado, priorizar fuentes con RSS/API propia antes que scraping.

**Estado actual: eliminada de la UI.** La pantalla `app/(app)/juegos/[id]/guias/` se borró: no tenía alta de guías (el form y `createGuide` ya se habían sacado) y el checklist quedó sin uso frente al advisor con IA y los enlaces externos, que son lo que la ficha del juego prioriza. Las tablas `guides`/`guide_steps`/`user_guide_progress` **siguen existiendo** con sus RLS: `lib/ai/prompt.ts` sigue leyendo las guías propias para que la IA no las contradiga, y `/juegos/[id]/enlaces` muestra las filas de `guides` que tengan `external_url`. Hoy esas filas solo se crean del lado de la base: desde #160 (`20261011000000_guides_read_only.sql`) `guides`/`guide_steps` son de **sólo lectura** para `authenticated` (cualquiera podía colgar un enlace de phishing en la ficha de cualquier juego), y la ficha además descarta los `external_url` que no sean `https:`. Si alguna vez vuelve una UI de guías, hay que recrear las policies de escritura y la regla de autoría sigue siendo la de siempre: validar en la Server Action **y** en la RLS.

## Enlaces externos curados automáticamente: `lib/external-guides/`

Pobla `game_external_guides` (tabla sin RLS de insert para `authenticated` — solo lectura pública; se escribe con `lib/supabase/service.ts`, ver migración `20260817130000_create_game_external_guides.sql`) combinando dos fuentes, ninguna paga ni hace scraping de HTML de terceros:

- `lib/external-guides/steam.ts` — Steam Web API oficial (`IPublishedFileService/QueryFiles`, requiere `STEAM_API_KEY`, gratis) para traer las guías de la comunidad de Steam mejor puntuadas de un juego. Resuelve el appid antes vía `store.steampowered.com/api/storesearch` (público, sin key). `filetype=11` es `k_EWorkshopFileType.WebGuide` — **no usar `9`** (es `Concept`, no trae nada). **No alcanza con pedir lo más votado**: el top de votos de un juego suelen ser traducciones no oficiales, mods y curiosidades, no guías para platinar. Se hacen dos consultas y se cruzan: una por etiqueta (`requiredtags` con Achievements/Walkthroughs/Secrets/… + `match_all_tags=false`, que es la mejor señal porque la etiqueta la pone el autor) y otra por texto (`query_type=12`, para los juegos donde nadie etiquetó nada). `lib/external-guides/steam-relevance.ts` (sin `server-only` a propósito, es texto puro y se testea) descarta el ruido conocido y ordena por relevancia; las etiquetadas pesan más que las que sólo matchean por título. Además filtra por idioma (`isReadableLanguage`): **solo español e inglés** — se descarta todo título en escritura no latina (cirílico, CJK, hangul…) y los marcadores de otros idiomas latinos (portugués, italiano, alemán, francés, polaco…), por bien puntuada que esté la guía. Como el upsert nunca borra, `populateExternalGuidesForGame` **borra las filas `source_type = 'steam_api'` del juego antes de reinsertar** (solo si Steam contestó): sin eso, los enlaces guardados por una versión anterior del filtro seguían apareciendo para siempre.
- `lib/external-guides/site-search.ts` — no depende de ninguna API (ni paga ni gratis): arma un link a la búsqueda propia de PowerPyx/PSNProfiles/TrueTrophies para el nombre del juego (`?s=`/`/search/games?q=`/`game_search.php?search=`). No se fetchea ni se lee el HTML de esos sitios del lado del servidor — el usuario abre el link y navega los resultados en su propio browser. Se probó antes con la tool `web_search` de Claude (requiere créditos pagos de la API de Anthropic); se reemplazó por esto para que todo el flujo sea gratuito.
- `lib/external-guides/index.ts` — `populateExternalGuidesForGame()` combina ambas fuentes (Steam vía try/catch, si falla no bloquea a los links de búsqueda) y hace upsert con `onConflict: "game_id,url"` para no duplicar. `createServiceClient()` se llama sin try/catch propio adentro de esta función — si falta `SUPABASE_SERVICE_ROLE_KEY` tira una excepción sin capturar; por eso `findExternalGuides` (Server Action en `actions.ts`) envuelve toda la llamada en try/catch y devuelve el error como parte del estado en vez de dejar que la excepción llegue sin capturar al framework (que la muestra como error 500 genérico, "This page couldn't load").
- Se dispara manualmente desde `app/juegos/[id]/enlaces/` (botón "Buscar guías externas", `FindExternalGuidesButton.tsx` + `actions.ts`), no hay cron todavía.
- PowerPyx/PSNProfiles/TrueTrophies no tienen API propia y bloquean scraping directo (Cloudflare); si en el futuro se necesita traer el contenido real de sus guías (no solo un link de búsqueda), primero hay que revisar sus términos de uso (regla general de la sección "Guías de desbloqueo" arriba).

## Tiempos estimados de juego: `lib/time-to-beat/`

Cuánto lleva pasarse la historia principal y cuánto llegar al 100%, como HowLongToBeat. Se
muestran en el hero de la ficha de juego (`GameHero`, uno solo desde el issue #186), vía
`components/game/TimeToBeat.tsx`.

- **HowLongToBeat no tiene API pública** y no se usa: lo que circula por ahí es su endpoint
  interno de búsqueda, que exige un hash sacado del bundle JS del sitio y cambia en cada
  release (el mismo problema que el GraphQL de la PS App), además de un ToS que no permite
  scrapearlo. La fuente es **IGDB** (`game_time_to_beat`, de Twitch/Amazon): API oficial,
  gratis, y es el único proveedor que publica los **dos** números (`normally` y `completely`,
  en segundos).
- **El endpoint es `game_time_to_beats` (plural)** y la historia principal es `hastily`, no
  `normally`. Durante meses se consultó el singular, que no existe: **ningún** juego salió de
  IGDB y la ficha mostraba sólo estimaciones de IA (migración
  `20261002000000_reset_time_estimates.sql` borra ese caché). El criterio es el de
  HowLongToBeat (`pickIgdbTimes` en `match.ts`): historia = `hastily` ("Main Story"; `normally`
  es "Main + Extras"), 100% = `completely`, nunca menor que la historia, y con `count` < 3
  partidas el dato se descarta. El prompt de la IA pide los números de HLTB por nombre y va con
  `temperature: 0`.
- **Primero la tabla de referencia de HLTB** (`lib/time-to-beat/reference.ts`, fuente `hltb`):
  los "Main Story" y "Completionist" de HowLongToBeat de ~280 juegos de la biblioteca real,
  cargados a mano el 2026-10-18 desde los sitios que republican sus datos (DekuDeals,
  IsThereAnyDeal, PSPrices). Se agregó porque, comparado contra HLTB, la mayoría de lo
  cacheado estaba mal: IGDB promedia pocas partidas (348 h de historia en DRAGON BALL Z:
  KAKAROT, 6,7 h en The Last of Us) y la IA subestima casi todo. La clave es
  `comparableName`; un nombre de tienda que no queda igual ("Ultimate Edition", "– The
  Definitive Edition") va como alias. Para sumar un juego, se agrega una fila y se borra su
  `time_estimates_checked_at`. A IGDB además se le descarta una fila con historia de más de
  150 h (`MAX_PLAUSIBLE_BEAT_MINUTES`).
- **Después IGDB y, para lo que no tiene, una estimación del LLM** (`generateTimeEstimates` en
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
  `time_estimates_source` (`hltb`, `igdb`, `ai` o `none`), `time_estimates_checked_at`; migración
  `20260906000000_games_time_to_beat.sql`) desde `getGameCardData`, con la misma escritura por
  service role que la descripción y el fondo. **`time_estimates_checked_at` es la marca de "ya
  preguntamos"**: con valor no se vuelve a consultar aunque los dos tiempos hayan quedado en
  NULL, que es lo que evita pegarle a IGDB en cada visita a la ficha de un juego que no está
  en su catálogo.
- Desde el issue #193 el cliente HTTP (token + APIcalypse) y el match por nombre viven en
  `lib/igdb/`: la ficha resuelve el juego **una sola vez** (`resolveIgdbGame`) y ese id lo usan
  los tiempos y los estudios. `games.igdb_id` guarda el resultado.
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
- **Perdibles primero** (`lib/ai/next-trophy.ts`, puro y sin `server-only`): si queda algún perdible pendiente, la tarjeta "Siguiente trofeo" es **siempre el primero de `missables`** (el prompt los pide en orden cronológico de la partida: el primero es el que se pierde antes), aunque el modelo haya sugerido otro o el que sugirió ya se haya obtenido por sync después de generar el plan. Los pasos de `siguiente_trofeo` sólo se muestran si el modelo eligió ese mismo trofeo. La sección de perdibles va justo debajo de esa tarjeta, numerada, y aparece **también cuando no hay ninguno** ("no detectó perdibles" es una respuesta). El prompt le pide al modelo usar lo que sabe del juego y no sólo la descripción (en RPGs por actos, como The Witcher, la descripción casi nunca dice que el trofeo es perdible) y sigue prohibiendo los trofeos de historia. Ojo con el presupuesto de tokens del system prompt (AI-13): cualquier regla nueva se compensa recortando otra.
- Los chips de trofeo del panel son botones: al clickearlos llevan al trofeo en la lista de arriba y le abren la ayuda de "cómo desbloquearlo" ya cargada. El puente entre los dos Client Components (los monta `page.tsx`, que es Server Component) es un evento del DOM, `app/(app)/juegos/[id]/focusTrophy.ts`: `TrophyList` lo escucha, **limpia sus filtros** — si el trofeo estaba filtrado, su fila no está montada y no hay a dónde scrollear — y pasa un `focusToken` al `TrophyItem` correspondiente. En `TrophyItem` el token se compara durante el render (no con un `setState` en un `useEffect`, ver Convenciones de código); el `scrollIntoView` sí va en effect porque es DOM, no estado.
- Requiere `AI_PROVIDER_API_KEY` (API key de Groq, gratis en console.groq.com sin tarjeta) server-side, nunca `NEXT_PUBLIC_`. El free tier tiene rate limit bajo (30 req/min, 14.4k req/día a nivel organización) — si el advisor empieza a fallar con error 429, es eso, no un bug.

## Performance: lag general de la app

Diagnóstico (2026-08-19) sobre por qué la app se sentía lenta "en todos lados", no solo en el sync de PSN:

- **`proxy.ts` corría en cada request de toda la app** (matcher original excluía solo estáticos), haciendo `supabase.auth.getUser()` — un round-trip a Supabase Auth — antes de renderizar cualquier página, incluidas públicas. Ahora sólo las rutas que dependen de sesión (`SESSION_PATH_PREFIXES` en `proxy.ts`) pagan ese costo. Desde #222 el proxy (ex `middleware.ts`, renombrado por la convención de Next 16) **sí corre en todas las páginas** (excluye `/api`, `/_next/static`, `/_next/image` y archivos con extensión), pero sólo para ponerles la CSP con nonce, que no sale a la red. Cada página protegida sigue validando su propia sesión server-side además del proxy (redundante a propósito, no se tocó — ver convención de doble capa de autoría en guías).
- **Queries a Supabase en serie que no dependían entre sí**: `app/juegos/[id]/page.tsx` encadenaba con `await` game → trophies → user_trophies → plan de IA cacheado (solo dependen de la `membership` ya confirmada); `app/juegos/page.tsx` encadenaba psnAccount → library, y por separado trophies → user_trophies. Se pasaron a `Promise.all` donde no había dependencia real. `app/perfil/page.tsx` ya usaba `Promise.all` para su primer par de queries — quedó como estaba.
- **`next/image` con `unoptimized`** en `GameCard.tsx`, `TrophyItem.tsx` y `juegos/[id]/page.tsx`: estaba puesto porque `next.config.ts` no tenía `images.remotePatterns` configurado (Next rechaza hosts no whitelisteados). Se agregaron patterns para los hosts reales de donde vienen las imágenes (`*.playstation.com`, `*.rawg.io`, `*.steamgriddb.com`) y se sacó `unoptimized` — ahora Next sirve las carátulas/íconos resizeadas y en WebP/AVIF vía su optimizador, en vez del archivo original.
- Faltaba `loading.tsx` en `app/psn/` (sí existía en `/juegos`, `/juegos/[id]`, `/perfil`) — se agregó, mismo patrón que las demás rutas (`LoadingState`).
- **Ya resuelto (2026-08-20)**: lo de arriba se implementó. `get_library_trophy_stats()` (migración `20260820020000_library_trophy_stats_rpc.sql`) agrega total/obtenidos por juego y por tipo con `GROUP BY` en Postgres, `security invoker` + `auth.uid()` (respeta las RLS existentes, no hace falta service role). `juegos/page.tsx` y `perfil/page.tsx` llaman a este RPC en vez de paginar manualmente por miles de filas de `trophies`/`user_trophies`. `juegos/[id]/page.tsx` (una sola página de juego, no necesita agregación entre juegos) en cambio filtra `user_trophies` con `.in("trophy_id", trophyIds)` acotado a los trofeos de ese juego -- sin RPC, ya que ahí alcanza con no traer los trofeos de TODOS los demás juegos del usuario. Confirmado con la cuenta real del usuario que esto era el cuello de botella real (208 juegos / 10.284 trofeos / 2.076 desbloqueados hacían que `/juegos` tardara 4-7s de puro `application-code` en el server, incluso después de paralelizar queries).

Verificación manual: `npx tsc --noEmit` y `eslint` limpios sobre los archivos tocados; se levantó el dev server y se confirmó con `curl` que `/juegos`, `/psn` y `/perfil` siguen devolviendo 307 a `/login` sin sesión (el middleware acotado sigue protegiendo esas rutas), y que rutas públicas (`/`, `/registro`) cargan sin pasar por el middleware.

## Diseño visual: la app de Letterboxd como referencia

### Sistema de diseño (`app/globals.css`) — fase 1 del remake (issue #176)

`app/globals.css` es la **fuente única de verdad** del diseño. Antes de esta fase, los tokens
que definía estaban muertos: 566 `zinc-*` a mano en 79 archivos contra **0** usos de
`bg-surface`/`text-muted`. Convivían dos sistemas y ganaba el improvisado.

**Regla permanente: ningún componente usa un color literal de Tailwind** (`zinc-*`, `blue-*`,
`emerald-*`, `amber-*`…). Todo pasa por un token. Si hace falta un color que no existe, se
agrega como token **con su rol**, no se hardcodea en el JSX. **La regla la hace cumplir ESLint**
(`eslint-rules/no-tailwind-literal-colors.mjs`, activada sólo sobre `app/**` y `components/**`
en `eslint.config.mjs`): un `zinc-800`, `blue-500/20` o `emerald-400` en cualquier string de
esos archivos es un error de lint, y el job "Lint + tipos" de `.github/workflows/e2e.yml` lo
corre en cada PR. `white`, `black`, `transparent` y `current` no cuentan como paleta y siguen
permitidos (texto blanco sobre un relleno de acento, `bg-black/70` de un backdrop). La regla
tiene su propio test con el `RuleTester` de ESLint (`npm run lint:rules`, incluido en
`npm run lint`), sin Playwright ni Supabase: es una regla, no comportamiento de la app.

Los tokens se declaran dos veces a propósito: el valor crudo en `:root` con nombre sin
prefijo (`--ink`, `--accent`), y el mapeo a la utilidad de Tailwind en `@theme inline`
(`--color-ink: var(--ink)`). **No escribir `--color-x: var(--color-x)`**: eso es una
autorreferencia que sólo funciona por orden de cascada entre dos bloques `:root`, y se rompe
sin aviso si Tailwind cambia dónde emite el suyo.

- **Chrome** (2): `chrome` (el header) y `chrome-raised` (la barra inferior de mobile). Lo
  único más oscuro que el fondo; antes las barras caían en `background` por descarte.
- **Superficies** (3 + fondo): `background` / `surface` / `surface-raised` / `surface-hover`.
  Desde #184 los seis escalones (chrome incluido) son el mismo gris azulado (OKLCH h=255,
  C=0.024) a pasos iguales de luminosidad, y el fondo dejó de ser casi negro. Si se retoca
  uno, se retocan los seis con el mismo paso: el problema que se arregló era justamente que
  `surface` y `surface-raised` no se distinguían en las filas con hairline.
- **Tinta** (3): `ink` (texto principal) / `ink-muted` (metadatos) / `ink-faint` (versalitas y
  deshabilitado; **nunca** para texto de lectura).
- **Hairlines** (2): `border` es el separador sutil, `border-strong` el borde de un control
  interactivo, que sí tiene que verse (WCAG 1.4.11).
- **Acentos**: `accent` es el azul PSN **como relleno**; `accent-ink` es el mismo azul **como
  texto o ícono** sobre superficie oscura — son dos tokens porque tienen umbrales de contraste
  opuestos y confundirlos es el bug de accesibilidad clásico. `accent-hover` va más **oscuro**
  que `accent`, no más claro: es el hover de un relleno con texto blanco encima. `accent-2`
  (rosa ○) sólo para display grande y como base del like. **El azul es el único color de
  acción** (tab activo, botón +, links, primario, tu rating), como el verde de Letterboxd.
- **Rating y like** (#184): tres colores de estrella según **de quién** es la puntuación.
  `rating` es la tuya (alias de `accent-ink`: lo que hiciste va en el color de hacer cosas),
  `rating-muted` la de otro en un feed o una lista, y el promedio de la comunidad va en
  `trophy-gold`, el oro del platino. `StarRatingDisplay` pide `tone` (`own` / `others` /
  `community`) **obligatorio**, sin default: un feed nuevo no puede heredar el color de acción
  sin que nadie lo decida. `like` es el corazón (reseñas, listas y publicaciones): el rojo
  de Instagram (`#ff3040`), en toda la app. Sólo como ícono relleno (3.87:1 en el peor caso,
  pasa el 3:1 de ícono); el corazón sin like va en `ink`, no en rojo apagado.
- **Semánticos**: `success` (100% / logro obtenido), `danger`, `warning`.
- **Trofeos**: los cuatro de PSN más `trophy-neutral` para el `achievement` de Steam, que es
  "sin desglose" y no un quinto color.
- **Rareza** (3 + 1): `rarity-ultra` / `rarity-very` / `rarity-rare`, y "común" sin token
  propio (va con `ink-muted`). Son tokens aparte de los de trofeo porque la rareza es
  **ortogonal al tipo** -- hay bronces ultra raros y platinos comunes -- y pintarla con el oro
  o la plata haría que las dos escalas se lean como una sola.
- **Radios** (3): `rounded-chip` (pills, badges), `rounded-card` (tarjetas, carátulas, inputs)
  y `rounded-full`, que es **sólo para avatares**.

Cada token nuevo se audita contra las **cuatro** superficies (más los dos `chrome`) y se
reporta el peor caso, no el mejor: ver `ACCESSIBILITY.md`. Un token que sólo pasa AA sobre el fondo más oscuro falla
apenas se lo usa dentro de una tarjeta en hover, y para entonces ya lo heredó media app.

### Tipografía: dos familias con roles

- **Geist (sans)** para el *chrome*: nav, botones, metadatos, números de stats, versalitas.
- **Newsreader (serif)** para el contenido editorial: nombre del juego en las fichas y cuerpo
  de las reseñas del diario. El contraste serif/sans es lo que hace que la app no se lea como
  un dashboard; es la mitad de la identidad de la referencia.

`body` toma `var(--font-ui)`. Durante mucho tiempo decía `Arial, Helvetica, sans-serif`, así
que **la app entera se renderizaba en Arial** mientras la Geist que carga `app/layout.tsx` no
la usaba nadie. Ese tipo de bug no se ve leyendo un diff: por eso `21-design-system.spec.ts`
verifica el **estilo computado** en un navegador y no las clases del JSX.

La escala vive en `globals.css` como `@utility type-*` (Tailwind v4, así aceptan variantes:
`sm:type-title`) y se elige **por el rol del texto**, no combinando `text-sm font-semibold
tracking-wide` de memoria: `type-display` (nombre del juego en un hero, serif),
`type-title` (h1 de pantalla), `type-subtitle` (título de fila), `type-body`, `type-review`
(cuerpo de reseña, serif), `type-meta`, `type-caption`, `type-overline` (versalitas de
`SectionHeader` y de las tiras de stats) y `type-stat` (el número grande, con `tabular-nums`
para que no baile al actualizarse).

Ojo con un detalle de Tailwind: **una `@utility` que nadie usa no se compila**. Si una clase
`type-*` está en el HTML pero no aplica nada, lo más probable es un typo en el nombre.

### Primitivas migradas — fase 2 del remake (issue #176)

Las piezas compartidas (`components/Button.tsx`, `Input.tsx`, `StatCard.tsx`,
`ProgressBar.tsx`, `Modal.tsx`, los tres badges, `components/ui/*` y
`components/game/GamePoster.tsx`) ya no usan ningún color literal: son la referencia de cómo
se ve un componente migrado.

Reglas que salieron de esta pasada:

- **Los tamaños de texto también son un token.** Cada primitiva declara su nivel `type-*` y
  quien la usa **no lo pisa** con un `text-sm`/`text-xs` en el `className`. Esos overrides
  existían sólo porque las primitivas no tenían escala propia, y se borraron de los seis
  llamadores que los tenían. No es cosmético: `text-sm` y `type-body` son dos utilidades que
  fijan `font-size`, y cuál gana depende del orden en que Tailwind las emite, no del orden en
  que están escritas en el string.
- **`accent` vs `accent-ink` en los estados activos.** El activo de `SegmentedControl` y de
  `ToggleChip` lleva relleno `accent/15` pero texto y borde `accent-ink`: el acento de relleno
  sólo llega a 3.06:1 sobre superficie oscura, y ahí es tinta y borde de control, no relleno.
  Es el mismo error que ya se había corregido una vez en `Button`.
- **`surface` es el fondo de un campo o control, `surface-raised` el de lo que flota.** `Modal`
  va en `surface-raised` (está por encima de la tarjeta desde la que se abrió); `SearchField`,
  `Select` y `SegmentedControl` van en `surface`.
- **`border-strong` para todo lo interactivo, `border` sólo para separar.** El hairline `border`
  no llega a los 3:1 de WCAG 1.4.11 y no puede ser el borde de un input ni de un botón.

### Biblioteca y ficha de juego — fase 3 del remake (issue #176)

`/juegos` y `/juegos/[id]` (con `GamesLibrary`, `TrophyList`/`TrophyItem`, `GameDetailHero`,
`TimeToBeat` y `AiAdvisorPanel`) ya no usan ningún color literal ni ningún emoji. Lo que salió
de esta pasada:

- **La lista de trofeos son filas con hairline, no tarjetas.** Con 50 trofeos en pantalla, 50
  marcos de 1px compiten entre sí y no gana ninguno: lo que distingue una fila de la otra es
  el color del ícono de tipo, que es justamente el dato que se busca de un vistazo. "Obtenido"
  tampoco es un fondo verde -- teñía media lista en cuanto el juego iba por la mitad -- sino
  el ícono a plena opacidad más un chip de `success`.
- **El nombre del juego en `GameDetailHero` es el único texto editorial de la ficha** y va en
  `type-display` (la serif). Los metadatos de al lado son chrome y van en versalitas. Es el
  contraste que hace que la ficha no se lea como un dashboard, y `21-design-system.spec.ts`
  lo verifica por estilo computado (la clase puede estar puesta y la `@utility` no compilar).
- **El filtro de plataforma de la biblioteca tiene la forma de `SegmentedControl` pero sigue
  siendo links**, no el componente: el filtro vive en la URL y se aplica en la query de
  Postgres, así que cada opción **es** una navegación (linkeable, con "atrás" del browser),
  no un `onChange`. Comparte con el componente el activo en `accent/15` + `accent-ink`.
- **El bloque de estado de sync se comprimió a una línea** al lado del título: eran tres
  párrafos y un botón antes de la primera carátula, y en una app de navegar lo primero que se
  ve tiene que ser el contenido.
- **El advisor dejó de tener seis colores de sección.** Cada `SectionCard` traía el suyo
  (azul, ámbar, rojo, índigo, teal, púrpura) y el panel se leía como un semáforo. Ahora son
  cuatro tonos del sistema, y `warning`/`danger` quedan reservados para lo que de verdad
  cuesta trofeos: perdibles y desafíos de dificultad. El tono pinta **la barra lateral y el
  encabezado, no el contenedor** -- puesto en el `div`, el color se filtraba a todo el texto
  de adentro que no declarara el suyo.
- **Los estados compartidos** (`EmptyState`, `ErrorState`, `LoadingState`, `GameBreadcrumb`,
  `SyncButton`) se migraron acá aunque su rediseño completo sea de la fase 5: aparecen dentro
  de estas pantallas, y la regla del issue es no mergear una fase que deje media pantalla con
  la piel nueva y media con la vieja.

### Diario — fase 4 del remake (issue #176)

`/diario`, `/diario/amigos`, `/diario/resumen`, `/diario/capturas` y
`/juegos/[id]/diario` (con `GameHero`, `DiaryTimeline`, `GameDiarySection`,
`EditDiaryEntryForm`, `RecommendationsSection`, `StarRating` y las tres piezas de capturas) ya
no usan ningún color literal ni ningún emoji. Lo que salió de esta pasada:

- **Es la pantalla donde la serif se gana el lugar.** La reseña del diario va en `type-review`
  y el nombre del juego de `GameHero` en `type-display`, igual que su primo `GameDetailHero`.
  Una reseña es lo único de la app que se lee como un texto y no como un dato, así que una
  reseña en la sans de 12px era la mitad del rediseño sin aplicar. Como en la fase 3, se
  verifica por **estilo computado** (DS-12/DS-15): la clase puede estar puesta y la `@utility`
  no compilar.
- **Las estrellas del rating son un ícono, no el glifo ★.** ★ y ☆ son dingbats: cada sistema
  los dibuja con su forma y su ancho, así que las cinco estrellas no alineaban entre
  dispositivos y el oro venía del carácter, no del token. `StarRating` dibuja el ícono `star`
  del set y la **media estrella es el mismo ícono recortado al 50%** — nunca un segundo ícono
  de "media estrella", que sería otra forma y se notaría al lado de una entera.
- **Las entradas de diario dejaron de ser tarjetas.** Misma regla que la lista de trofeos de la
  fase 3: filas separadas por un hairline. Un historial de rejugadas o de "otros usuarios" son
  N marcos de 1px apilados, y lo que interesa distinguir es la reseña, no el marco.
- **Un solo "Volver al diario"** (`components/diary/BackToDiaryLink.tsx`): estaba copiado en
  las tres subpantallas con el carácter ← suelto adelante.
- **El esfuerzo de las recomendaciones sale de los tokens semánticos** (`success` / `warning` /
  `danger`) y no de un verde, un ámbar y un rojo elegidos a ojo: "poco esfuerzo" es el mismo
  verde que un logro obtenido.
- Los `<select>` del timeline y del importador de capturas pasan a `components/ui/Select`, y el
  selector de año del resumen toma el activo de `SegmentedControl` (`accent/15` + `accent-ink`),
  aunque siga siendo links porque el año vive en la URL (misma razón que el filtro de fuente de
  la biblioteca).
- Íconos nuevos en el set: `star`, `camera`, `chart`, `note` (contenido) y `arrow-left` /
  `arrow-right` (chrome, de trazo).

### Iconografía: sin emojis

`components/ui/Icon.tsx` es el set propio (viewBox 24×24, `currentColor`, `fill-rule: evenodd`).
Un emoji se dibuja distinto en cada sistema operativo, viene con su propio color y no toma el
del tema: queda como una calcomanía pegada encima del diseño, y es el tell más fuerte de "esto
lo generó una IA". Sin `label` el ícono es decorativo y va `aria-hidden`; con `label` se
anuncia como imagen, sólo cuando el ícono **es** la información.

El set tiene dos mitades con convenciones distintas: los íconos de **contenido** (trofeo, 100%,
IA, objetivo, reloj, plataformas) son sólidos, que es lo que los hace legibles como marca
sobre una carátula; los de **chrome** (lupa, ✕, chevron, filtros, tilde) son de trazo, porque
a 14-16px un contorno de 2px se lee mejor que una silueta rellena. La lista `STROKE_ICONS` de
`Icon.tsx` decide cuál es cuál; antes esos cinco estaban copiados a mano en `Modal`,
`SearchField`, `Select`, `ToggleChip` y `MobileDisclosure`, con tres grosores de chevron
distintos.

La fase 3 sumó los que faltaban para vaciar de emojis la biblioteca y la ficha: `link`,
`book`, `help`, `alert`, `flame`, `bulb`, `list`, `repeat` (contenido) y `arrow-down`
(chrome, el único de trazo). Van todos sin `label`: acompañan a un texto que ya dice lo
mismo, así que son decorativos.

Los íconos de trofeo **por tipo** no están en ese set: `components/TrophyTypeIcon.tsx` muestra
los trofeos oficiales de PlayStation (bronce, plata, oro, platino), que aportó el dueño del
proyecto: `public/trophies/<tipo>-sm.webp` (96px) para las listas y `public/trophies/platinum.png`
(512px) para los usos grandes del platino. El logro de Steam no es un trofeo y sigue como la copa
vectorial en gris (`TrophyVectorIcon`). Son assets de Sony usados con decisión explícita del
dueño; si la app se hace pública y masiva, conviene reemplazarlos por diseño propio. Las
plataformas siguen yendo con un gamepad y un monitor genéricos, nunca con los logos de
PlayStation o Steam.

### Estructura (decidido el 2026-09-05)

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

La **barra de controles** de una pantalla de listado (biblioteca, lista de trofeos) es el
otro patrón compartido, en `components/ui/`: `SearchField` (buscador con lupa y ✕),
`SegmentedControl` (un marco con las opciones adentro, en vez de N píldoras sueltas),
`ToggleChip` (lo que antes era un checkbox de 16px, ahora un chip de 44px con
`role="switch"`), `Select` (el `<select>` nativo con la piel de la app: en mobile el selector
del sistema gana a cualquier dropdown propio) y `MobileDisclosure`, que en mobile pliega todo
eso detrás de un botón "Filtros" con el globito de cuántos hay puestos y en `sm` pasa a
`display: contents` para que quede la misma fila de escritorio de siempre. Es `<details>`, no
estado de React: sin JS, accesible por definición y sin flash en el primer render. **El
buscador nunca se pliega**: con cientos de juegos es el control principal, no un filtro
secundario. La búsqueda de la biblioteca vive en `?q=` (misma regla que el resto de los
filtros, `useUrlFilterState`) y matchea con `lib/library/search.ts` -- módulo puro, sin
`server-only`, que **no** reusa `normalizeName` de `lib/catalog/`: ese borra los tokens de
edición ("remastered") y trata los acentos como separadores, que para comparar catálogos está
bien y para buscar está mal.

Las **tiras de estadísticas** (perfil y ficha de juego) son el otro patrón prestado: número
grande, etiqueta chica en versalitas, celdas separadas por 1px. En mobile van de 2 o 3 por
fila.

La ficha de juego es **una sola**, con tabs: ver "Ficha de juego unificada" más abajo. Los dos
heroes primos que había (`GameDetailHero` y `diary/GameHero`) se fusionaron en
`components/game/GameHero.tsx` (issue #186).

`components/GameCard.tsx` (la fila de la biblioteca con progreso, horas y desglose por tipo)
**se eliminó**: la reemplazó la grilla de carátulas.

`components/profile/` son las piezas del perfil (`ProfileHeader`,
`ProfileStatStrip`, `FavoriteGamesSection`, `RecentReviewsSection`,
`FriendsStrip`), compartidas entre el perfil propio y el de otro usuario — ver la
sección de perfil más abajo.

### Perfil, configuración, chrome y estados — fase 5 del remake (issue #176)

`/perfil`, `/perfil/[id]`, `/configuracion/*`, `AppHeader`, `MobileTabBar`, los tres estados
(`EmptyState` / `ErrorState` / `LoadingState`), `components/profile/*`, `components/friends/*`,
`components/connections/*`, `components/pwa/*` y las pantallas de auth y offline ya no usan
ningún color literal. Con esto las dos `grep` del DoD dan **0**. Lo que salió de esta pasada:

- **El logo es una imagen** (`public/logo.webp`, con transparencia, recortada y reducida del
  PNG original) en el header y arriba de los forms de auth; reemplaza al "Platin|oob" tipeado
  con dos colores. Va con `unoptimized` por la misma razón que `GameArt` (la cuota de
  transformaciones de Vercel) y el link del header lleva `aria-label="Platinoob"`, así que el
  nombre accesible no cambió.
- **El activo de una nav no es sólo un color.** Header, barra inferior y tabs de Configuración
  marcan el tab activo con tres señales: `accent-ink`, peso 600 contra 500 y una regla de 2px
  (`after:`/`before:` con `bg-accent-ink`), además de `aria-current="page"`. La nav del header
  va en `type-overline` (es chrome, no lectura) y los íconos de la barra inferior salen del set
  (`gamepad` / `book` / `user` / `settings`) en vez de paths copiados a mano. El header pasa a
  `max-w-5xl`, el mismo ancho que las pantallas de listado: con `max-w-4xl` el logo quedaba
  corrido respecto del contenido.
- **Dos anchos de contenedor y nada más**: `max-w-5xl` para listados (biblioteca, diario,
  perfil, fichas) y `max-w-2xl` para formularios (Configuración; auth va en `max-w-sm` dentro
  de la misma familia). Cada layout lo dice en un comentario.
- **`EmptyState` tiene jerarquía**: ícono del set en un círculo, título, descripción opcional y
  acción primaria. Reemplaza a las cinco copias del "párrafo en marco punteado" que tenían
  `FriendsStrip`, `FavoriteGamesSection`, `DiaryPreviewSection` y los dos feeds de amigos, y los
  callers viejos ganan un ícono (`gamepad`, `search`, `book`, `chart`). `ErrorState` suma el
  ícono `alert` con el mismo `role="alert"`.
- **Las instrucciones de Conexiones van plegadas** en `components/ui/Disclosure.tsx`, un
  `<details>` nativo cerrado por defecto (no `MobileDisclosure`, que es sólo-mobile y tiene
  estado propio por el problema de `::details-content`). Lo que queda a la vista es la acción:
  el campo NPSSO / SteamID y el botón. **Excepción a propósito**: las instrucciones para
  destrabar un perfil de Steam en privado siguen desplegadas, porque son el arreglo de un estado
  roto que la app ya detectó (misma lógica que el form de reconexión con NPSSO vencido).
- **Las stats del perfil son una sola tira**: `TrophyTypeStrip` (los cuatro tipos de PSN, con
  celdas separadas por 1px vía `gap-px` + `bg-border`, sin bordes por celda) reemplaza a la
  tarjeta-con-cuatro-tarjetas que estaba copiada en el perfil propio y en el ajeno; el panel de
  Steam usa `ProfileStatStrip`. La banda del `ProfileHeader` sale de `accent/50 → accent/15 →
  surface`, no de un azul de Tailwind.
- **El feed de amigos son filas con hairline** con carátula 3:4, la reseña en `type-review` y
  el "tiene reseña" de la grilla como ícono `note` con `label` (ahí el ícono **es** la
  información, al revés que el resto del set). Era el último 📝 y el último 📡 (offline) en
  JSX.
- **Chip de estado de conexión** en color semántico: `success` conectada, `warning` "necesita
  atención", `ink-muted` sobre `surface-hover` "no conectada" (un vacío, no un problema). El
  "Iniciar sesión con Steam" es un `<a>` con `buttonClassName("primary")`, exportada de
  `Button.tsx` para que un link que tiene que verse como botón no hardcodee el azul.

Íconos nuevos: `user`, `users`, `settings`, `download`, `offline` (contenido) y `plus`,
`logout` (chrome, de trazo). Tests DS-16..DS-20 en `21-design-system.spec.ts` y sus filas en
`TESTING_PRD.md` §6.18: activo del header por estilo computado, íconos de la barra inferior,
plegado de instrucciones, chip de estado contra su token, offline sin emoji. Ojo con DS-18 y
DS-19: no asumen el estado de la cuenta PSN (otro test de la corrida puede haberla conectado)
-- abren el plegado de reconexión si existe y leen `data-status` antes de elegir el token.

### Barrido final — fase 6 del remake (issue #176)

Cierra el issue. No toca ninguna pantalla: convierte la convención en algo que falla en CI y
deja la documentación consistente con el sistema real.

- **`npm run lint` falla ante un color literal de Tailwind** en `app/` o `components/` (ver la
  regla arriba). Antes de esto, el DoD se verificaba con `grep`; ahora un PR que reintroduzca un
  `text-zinc-400` "por ahora" se pone en rojo solo.
- **CI corre lint y `tsc`** como job propio (`Lint + tipos`), separado del build de
  Playwright, para que un color literal se vea por su nombre y no como un fallo de E2E.
- `.claude/**` está en los ignores de ESLint: los worktrees locales de Claude Code traen su
  `.next/` compilado y, sin eso, `npm run lint` en local tardaba minutos y reportaba miles de
  errores ajenos al repo.
- `PRODUCT_SPEC.md` §7 describe el sistema real (tokens, dos familias, escala `type-*`, set de
  íconos, anchos de contenedor) en vez del borrador de "una sans-serif moderna tipo Inter".
- `ACCESSIBILITY.md` aclara que las tablas anteriores al remake (`zinc-*`/`blue-*`) son
  históricas: describen problemas de una piel que ya no existe.

## App instalable en el celular (PWA)

Platinoob se instala en el celular desde el navegador — "Añadir a pantalla de inicio" /
"Instalar aplicación" — sin pasar por App Store ni Play Store. No hay build nativo ni
wrapper: es la misma app de Next, con manifest y service worker.

- `app/manifest.ts` (ruta de metadata de Next, se sirve en `/manifest.webmanifest`).
  `start_url` es `/biblioteca` y no `/`: quien instala ya tiene cuenta. Los íconos son PNG
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

La navegación (barra inferior de 5 botones en mobile, header en escritorio) está descripta
en "Navegación de 5 botones" más abajo. El header **no** es `sticky`: la ficha de juego tiene
su propia barra `sticky top-0` y las dos se pisarían.

## Navegación de 5 botones (epic #183, issue #185)

La estructura de Letterboxd: tres gestos -- **descubrir, registrar y mostrar** --, cada uno
con su botón. Reemplaza a los cuatro tabs de tracker (Biblioteca / Diario / Perfil /
Configuración).

- **`app/(app)/nav-links.ts` es la fuente única** de la barra y del header: `TAB_BAR_ITEMS`
  (Biblioteca, Buscar, `"register"`, Actividad, Perfil), `HEADER_LINKS` (Biblioteca,
  Actividad, Perfil), `isActiveLink` (con `alsoActiveOn`: la ficha `/juegos/[id]` cuenta como
  Biblioteca; `/diario/*` y `/configuracion` como Perfil), `sectionTitle` y
  `showsSettingsGear`.
- **Barra inferior (mobile, `MobileTabBar`)**: cinco botones sin texto visible (nombre en
  `aria-label`), íconos del set `library` / `search` / `plus-circle` / `bolt` / `user`. El
  activo es una píldora de `surface-hover` detrás del ícono + ícono en `accent-ink` +
  `aria-current`. El **+ es un `<button>` con `aria-haspopup="dialog"`**, no un link: abre
  `RegisterLauncher` (`components/register/`) en una `BottomSheet`
  (`components/ui/BottomSheet.tsx`), con las tres opciones de "Jugando ahora" (#187, ver esa
  sección).
- **Header mobile**: barra en `chrome` con el título de la sección en `type-title` (un `<p>`,
  no un `h1`: el `h1` es de la pantalla) y, **sólo en el perfil propio**, el engranaje a la
  izquierda hacia `/configuracion`. En la ficha de un juego, el logo.
- **Header escritorio**: logo · nav en versalitas · buscador inline (`<form method="get"
  action="/buscar">`, funciona sin JS; el popover de recientes es #194) · botón primario
  "Registrar" (el mismo `RegisterLauncher`, en un `Modal`) · menú de cuenta (Perfil,
  Configuración, Cerrar sesión). El menú es estado propio y no un `<details>` porque tiene que
  cerrarse al click afuera, con Escape y al navegar.
- **Sub-secciones = `components/ui/SwipeTabs.tsx`**, montado en el `layout.tsx` de cada
  sección. **Cada tab es un link a su ruta**, no estado de React (misma regla que `?fuente=`):
  linkeable, sobrevive al refresh, "atrás" funciona. Swipe horizontal en mobile con dos
  listeners de touch (umbral de 64px, gesto claramente horizontal, `touch-action: pan-y`) que
  **ignora el gesto si arranca dentro de algo que ya scrollea en horizontal** (un `PosterRow`):
  si no, deslizar un carrusel te cambiaba de pantalla. Teclado con el patrón de tabs de
  WAI-ARIA (← → Inicio Fin, roving tabindex, activación automática).
- **Rutas**: `/biblioteca` (+ `/resenas`, `/listas`), `/buscar`, `/actividad` (+ `/vos`,
  `/recibido`), `/perfil` (+ `/diario`, `/listas`, `/playlist`). Las del perfil propio van en
  el grupo `app/(app)/perfil/(propio)/` para que sus tabs no aparezcan en `/perfil/[id]`. Lo
  que todavía no existe es un `SectionPlaceholder` que dice qué va a haber: el shell se
  mergea antes que las features y ningún tab puede llevar a un 404.
- **Rutas viejas**: `redirects()` de `next.config.ts` (307, no permanentes mientras se arma el
  epic), porque Next pasa la query string sola: `/juegos?fuente=steam&q=…` → `/biblioteca?…`,
  `/diario?nuevo=1` → `/perfil/diario?nuevo=1` (sigue abriendo el modal), `/diario/amigos` →
  `/biblioteca/resenas`. `/juegos/[id]`, `/diario/resumen` y `/diario/capturas` **no se
  mueven**. Las Server Actions de `app/(app)/diario/*.ts` se quedaron donde estaban (las
  importa código de otros lados); sólo cambió a qué ruta hacen `revalidatePath`.
- `start_url` de la PWA pasa a `/biblioteca`; el matcher de `proxy.ts` y
  `isProtectedRoute` de `lib/supabase/middleware.ts` cubren las rutas nuevas.

## Ficha de juego unificada (epic #183, issue #186)

`/juegos/[id]` es **una ficha con tabs**, como la de una película en Letterboxd. Antes eran dos
pantallas primas (`/juegos/[id]` con trofeos y `/juegos/[id]/diario` con reseñas), cada una con
su hero, y sólo abrían juegos de tu `user_games`.

- **`app/(app)/juegos/[id]/layout.tsx`** monta lo que no cambia entre tabs: `GameHero` (el único
  hero: backdrop, póster, título en `type-display`, metadatos, horas, `TimeToBeat`, descripción)
  y `GameActionPanel` (tercera columna en escritorio, debajo de los datos en mobile). Cada tab
  es una ruta con su `page.tsx` y `SwipeTabs` las recorre: **Trofeos** (`/juegos/[id]`, la
  default: al abrir un juego lo primero que se busca es el progreso; tira de progreso +
  `TrophyList`), **Reseñas** (`/resenas`: tus partidas editables, las de tus amigos primero y
  después el resto, con el nombre de quien reseñó) y **Guías e IA**
  (`/guias`: advisor, enlaces externos y capturas; declara `maxDuration = 60` porque de ahí se
  invocan las actions del LLM y de Steam).
- **`lib/game-page/data.ts`** tiene los loaders compartidos con `cache()` de React
  (`getGamePageBase`, `getGameTrophyProgress`, `getGameDiary`): el layout y la tab se renderizan
  en el mismo request y sin eso cada consulta corría dos veces. Al cambiar de tab Next sólo
  renderiza la página nueva.
- **Cualquier juego tiene ficha.** `games` es de lectura pública, así que la ficha ya no pasa
  por `user_games`; `isMember` sólo decide lo que depende de tu progreso: la tab Trofeos y el
  advisor muestran un `EmptyState` que lo explica si el juego no está en tu biblioteca.
- **Juegos que no están en `games`** (resultados de RAWG): `/juegos/catalogo/[rawgId]` (route
  handler) los materializa con `materializeCatalogGame` (`lib/catalog/materialize.ts`) y
  redirige a `/juegos/[id]`. A diferencia de `addCatalogGame`, **no vincula a `user_games`**
  (abrir la ficha no es agregar el juego) y escribe por service role con `created_by` NULL
  (es catálogo compartido). La unicidad vive en la base: índice único de
  `games.external_catalog_id` + `on conflict do nothing` (migración
  `20260923000000_games_external_catalog_unique.sql`, que antes limpia los duplicados que
  `addCatalogGame` dejaba). En E2E, `fetchGameDetails` responde un fixture para los ids `E2E-…`.
- **Registrar una partida sí vincula** el juego a `user_games` (`createDiaryEntry`), mismo
  criterio que `addCatalogGame`.
- **Panel de acciones**: Jugando (#187) · Playlist (#188) · Lista (#189), con `aria-pressed`; "Registrar o puntuar" abre `AddDiaryEntryForm`
  en una `BottomSheet` en mobile y en un `Modal` en escritorio; debajo, tu puntuación (`rating`)
  y el score de la comunidad con su histograma (oro).
- **El foco de trofeo viaja en la URL**: el advisor y la lista ya no conviven, así que los chips
  del advisor son links a `/juegos/[id]/trofeos?trofeo=<id>` (`focusTrophy.ts`) y `TrophyList`
  lee el parámetro durante el render (no en un effect), limpia filtros y enfoca.
- Las actions revalidan con `revalidatePath("/juegos/<id>", "layout")`, que cubre las tres tabs.
- Rutas viejas: `/juegos/[id]/diario` → `/juegos/[id]/resenas`, `/juegos/[id]/trofeos` →
  `/juegos/[id]` y `/juegos/[id]/enlaces` → `/juegos/[id]/guias` (`redirects()` de
  `next.config.ts`).
- **Los toggles del panel (Jugando, Playlist, Lista) son optimistas y sus actions no
  revalidan `/juegos/[id]`.** `revalidatePath` desde una Server Action re-renderiza la página
  que se está viendo dentro de la respuesta de la action, y en la ficha eso eran segundos por
  toque (hero, datos externos, trofeos). El panel lleva su estado local, resincronizado con
  las props durante el render; si la action falla, vuelve al valor anterior.
- **Primera apertura con tope** (`CARD_DATA_BUDGET_MS` en `lib/game-page/data.ts`): si los
  datos externos de `getGameCardData` tardan más de 2,5 s, la ficha sale con lo que ya está en
  la fila y la consulta termina con `after()` (guarda el caché para la próxima visita).
- **La descripción es una sinopsis**: `lib/catalog/synopsis.ts` (`toSynopsis`, puro) toma el
  primer párrafo y lo corta en una oración completa dentro de 280 caracteres. Se aplica al
  mostrar, no al guardar, así también se arreglan las descripciones largas de RAWG ya cacheadas.
- **Imágenes a pantalla completa**: `components/ui/ImageLightbox.tsx` (`FullscreenImage` +
  `ExpandableImage`). La carátula del hero se toca para abrirla, el wallpaper tiene su botón
  (el backdrop es `pointer-events-none`) y las capturas de la galería se abren desde el
  lightbox con anterior/siguiente. Sus Server Actions quedaron en esas
  carpetas. `GameBreadcrumb` y `GameDiarySection` se borraron: las tabs y el panel los
  reemplazan.

## Jugando ahora (epic #183, issue #187)

El + deja de ser sólo "marcar como terminado": también dice **qué estás jugando**, y eso se
ve en tu perfil (y en el de otros), arriba de la biblioteca y en la ficha del juego.

- **`now_playing`** (migración `20260923010000_now_playing.sql`): una fila por **racha**
  (`started_at`, `ended_at`, `end_reason` en `manual` / `platinum` / `completion` /
  `diary_entry`). Terminar no borra: queda el historial para "jugando desde…" y la actividad
  (#195). El unique es **parcial** (`(user_id, game_id) where ended_at is null`): un juego no
  puede estar abierto dos veces, pero sí rejugarse. RLS: select `using (true)` (se muestra en
  perfiles públicos, como el diario), insert/update sólo el dueño, **sin delete**.
- Todo pasa por `lib/now-playing/`: `queries.ts` (server-only: `getNowPlaying`,
  `isPlayingGame`, `countFriendsPlaying`, `getPlaySuggestion`), `end.ts` (`endNowPlaying`) y
  `actions.ts` (Server Actions: `startPlaying`, `stopPlaying`, `dismissPlaySuggestion`,
  `getRegisterContext`). `startPlaying` vincula el juego a `user_games` (lo que estás jugando
  es parte de tu biblioteca) y traduce el `23505` del unique a "Ya lo estás jugando.".
- **Salidas automáticas**: el platino en el sync de PSN y el 100% en el de Steam cierran la
  racha **sólo si empezó antes** de conseguirlo (`achievedAt`): sin eso, marcar como jugando
  un juego ya platinado para rejugarlo duraba hasta el siguiente sync. Van en su propio
  try/catch al lado de `reconcilePlatinumDiaryEntry` / `reconcileCompletedDiaryEntry`: son un
  extra y no pueden tirar abajo el sync. `createDiaryEntry` la cierra con `diary_entry`.
- **Sugerencia** ("¿Estás jugando X?" en el +, "¿Empezaste X?" en la biblioteca): sale del
  `user_games.last_played_at` que ya escriben los syncs, **nunca marca solo**. Candidato = el
  último abierto que no está jugando, no está platinado ni al 100% y no lo dejaste después de
  esa sesión. El banner de la biblioteca además respeta el "Descartar"
  (`user_games.play_suggestion_dismissed_at` guarda el `last_played_at` del juego al
  descartarlo, **no la hora actual**: se vuelve a sugerir con uno posterior) y no sugiere nada de hace más de 30 días; el + no lleva esos filtros porque ahí
  el usuario abrió el menú a propósito. No hay una columna de "sugerencia" que escriba el sync:
  se deriva al leer, así el sync no suma escrituras.
- El + pide su contexto (`getRegisterContext`) **al abrirse**, no en el layout: vive en todas
  las pantallas. "Registrar un juego terminado" arranca con los juegos que estás jugando.
  `CatalogSearchCombobox` acepta `onSelectGame` para devolver el `games.id` elegido (ya dado
  de alta si venía de RAWG) en vez de navegar.
- Dónde se ve: `NowPlayingSection` (`components/now-playing/`, un `PosterRow`) en `/perfil`
  (con "Dejé de jugarlo" por carátula), `/perfil/[id]` y `/biblioteca` (sólo si hay algo);
  el toggle "Jugando" del panel de acciones de la ficha (`aria-pressed`, sin estado optimista:
  lo que se ve es lo que devolvió el server) con "N amigos lo están jugando". La línea
  "Empezaste a jugar X" de Actividad › Vos llega con #195, que es el feed de actividad.

## Playlist (epic #183, issue #188)

El equivalente de la Watchlist de Letterboxd: poner un juego en tu Playlist quiere decir que
lo **querés jugar**.

- **`user_playlist`** (migración `20260923020000_user_playlist.sql`): `user_id + game_id +
  added_at`, PK compuesta. RLS: select `using (true)` (se ve en perfiles, como la watchlist),
  insert/delete sólo el dueño, **sin update** (no hay nada que editar). **No depende de
  `user_games`**: casi siempre es un juego que todavía no tenés, por eso la ficha abre
  cualquier juego (#186).
- `lib/playlist/`: `queries.ts` (server-only: `getPlaylist`, `isInPlaylist`,
  `countFriendsWithInPlaylist`), `actions.ts` (Server Actions `addToPlaylist` —upsert que
  ignora el duplicado, así un doble click no es un error— y `removeFromPlaylist`),
  `remove.ts` (`removeFromPlaylistIfPresent`, nunca tira) y `sort.ts` (puro, sin
  `server-only`: los órdenes y `sortPlaylist`).
- **Sale sola** al empezar a jugarlo (`startPlaying`) o al registrarlo como terminado
  (`createDiaryEntry`), como Letterboxd al marcar una película como vista. Las dos devuelven si
  efectivamente la sacaron y la UI lo avisa ("Sacado de tu Playlist.") sólo en ese caso. No
  hay un sistema de toasts: el aviso es un `role="status"` en el lugar de la acción.
- **El toggle de la ficha es optimista** (`useOptimistic`), a diferencia del de "Jugando": es
  un gesto de un toque. Si la action falla, `useOptimistic` vuelve solo al valor del server al
  terminar la transición y se muestra el error; ese es el rollback. Íconos nuevos del set, de
  contenido: `playlist-add` / `playlist-check`.
- **`/perfil/playlist`**: grilla de 4 columnas en mobile y 6 en escritorio, sin progreso ni
  badges (acá la carátula es un recordatorio), contador en la cabecera y orden en `?orden=`
  (`recientes` / `nombre` / `anio` / `tiempo`, este último por `time_to_beat_minutes`: "qué me
  da tiempo a jugar"). Lo que no tiene el dato va siempre al final. En `/perfil/[id]` va como
  tab propia (`/perfil/[id]/playlist`, misma `PlaylistView` que la tuya), y la ficha dice "Está en la Playlist de N amigos".
- **Afuera por ahora**: el long-press / menú contextual "Agregar a Playlist" sobre cualquier
  póster. El issue lo marcaba opcional, y un long-press sobre un `<Link>` choca con el menú
  nativo del sistema en mobile; se agrega cuando haya un menú de póster compartido.

## Listas (epic #183, issue #189)

Las listas de Letterboxd, para juegos: numeradas o no, públicas o privadas. Este issue es la
base (datos, crear/editar, ficha y "Agregar a una lista"); descubrirlas es #191/#192 y los likes
son #190.

- **`user_lists`** (`title` 1-100, `description` hasta 2000, `is_ranked`, `visibility`
  `public`/`private`) y **`user_list_items`** (`list_id + game_id`, `position` 1..N, `note`
  hasta 280, `unique (list_id, position)`); migración `20260923030000_user_lists.sql`. RLS: una
  lista pública la lee cualquiera, una privada sólo su dueño, y los items **heredan** eso vía
  `exists` sobre la lista; escribir, sólo el dueño. Los límites están también en
  `lib/lists/constants.ts` (puro, lo usa el editor) y tienen que coincidir con los `check`.
- `lib/lists/`: `queries.ts` (server-only: `getUserLists`, `getList`, `countPlayed`,
  `countOwnListsWithGame`) y `actions.ts` (`saveList`, `deleteList`, `getMyListsForGame`,
  `toggleGameInList`). **`saveList` reescribe los items enteros** (delete + insert), igual que
  el Top 5: reordenar de a uno pasaría por dos items en la misma `position` y el unique lo
  rechaza. `toggleGameInList` agrega al final o saca, y puede dejar huecos en `position`: el
  orden se mantiene y la próxima edición renumera. Tope de 250 juegos por lista.
- **Rutas**: `/listas/nueva` (`?juego=<id>` la arranca con ese juego: el "Nueva lista con este
  juego" de la ficha), `/listas/[id]` y `/listas/[id]/editar` (404 si no es tuya). Una lista
  privada ajena también da **404**: no se confirma que exista. `/listas` está en el matcher del
  middleware y cuenta como la sección Perfil (`nav-links.ts`).
- **Editor** (`components/lists/ListEditor.tsx`): todo el estado vive en el cliente hasta
  "Guardar". El orden se cambia con **↑/↓ con nombre accesible** ("Subir X"/"Bajar X"), no con
  drag & drop, que podría sumarse encima pero nunca como único camino. El buscador
  (`CatalogSearchCombobox`, que ahora le pasa a `onSelectGame` el nombre y la carátula) va
  **fuera** del `<form>` del editor: tiene sus propios `<form>` para dar de alta juegos de RAWG,
  y un form anidado no es HTML válido.
- **Ficha**: título en `type-display` (es contenido editorial), autor con avatar, descripción
  en `type-review`, vista grilla/detalle en `?vista=` (links, no estado) y **"Vos jugaste N de
  M"** con una barra fina: cuenta lo que quien mira platinó, completó al 100% o registró en su
  diario (`countPlayed`, sobre `get_library_trophy_stats()` y `game_diary_entries`).
- **"Agregar a una lista"**: el toggle "Lista" del panel de la ficha (`aria-pressed` si el juego
  está en alguna de tus listas) abre `AddToListPanel` (hoja en mobile, modal en escritorio), que
  pide tus listas al abrirse y marca cada una con un toggle.
- Perfil › Listas muestra tus listas como `ListRow` (desde #197; las privadas con candado); "Nueva lista"
  es un botón en escritorio y un botón flotante en mobile (`NewListButton`), también en
  Biblioteca › Listas mientras esa pantalla sigue en placeholder.

## Likes (epic #183, issue #190)

La única interacción social del epic: me gusta en **reseñas** y en **listas**. No hay like a
juegos (para eso están el rating y el Top 5) ni comentarios.

- **`review_likes`** (`user_id + entry_id → game_diary_entries`) y **`list_likes`**
  (`user_id + list_id → user_lists`), PK compuesta; migración `20260924000000_likes.sql`. Dos
  tablas y no una polimórfica, para tener FKs reales y `on delete cascade`: borrar la reseña o
  la lista se lleva sus likes.
- RLS: los likes de reseñas se leen siempre; los de una lista, sólo si la lista es visible para
  quien mira. Insert/delete sólo a tu nombre, y **el insert exige que el objetivo sea ajeno**
  (y, en listas, público). La Server Action lo valida también, con mensaje: doble capa.
- **Sin contadores denormalizados**: `lib/likes/queries.ts` (`getReviewLikes`, `getListLikes`)
  cuenta las filas de los ids que la pantalla ya tiene. `lib/likes/state.ts` (puro) tiene el
  tipo `LikeState` y `likeStateOf`.
- `lib/likes/actions.ts`: `setReviewLike` / `setListLike` reciben el **estado deseado**, no un
  toggle: el corazón es optimista y dos toques rápidos tienen que terminar en lo que se ve.
- `components/likes/LikeButton.tsx`: `LikeButton` (toggle con `aria-pressed` y label "Me gusta
  la reseña de X" / "Me gusta la lista X", ícono `heart` / `heart-outline` en el token `like`)
  y `LikeCount` (sólo el contador). El valor confirmado vive en estado local y se resincroniza
  con las props durante el render: no depende de que la revalidación llegue a la pantalla.
- Dónde: filas de reseña de la ficha (las tuyas sólo con contador), el feed de Biblioteca ›
  Reseñas (el corazón va **al lado** del link de la fila: un botón dentro de un link es HTML
  inválido), la ficha de una lista (la propia sólo con contador) y, sólo como contador, las
  carátulas de "Últimas reseñas" del perfil y las `ListRow`.

## Biblioteca › Juegos y Reseñas (epic #183, issue #191)

El primer botón de la barra, la "home" de la app. A diferencia de Letterboxd, la primera tab es
**tu** biblioteca y no lo popular.

- **Juegos (`/biblioteca`)**: el título con el estado de sync en una línea y, debajo, secciones
  en este orden: sugerencia del sync + **Jugando ahora**, **Recomendados para vos** (la sección
  de IA, mudada desde el diario), **Cerca del platino** y **Tu biblioteca** (la grilla de
  siempre, con `?q=` / `?fuente=` / orden y filtros, en la misma URL). Las tres primeras son
  `PosterRow`: ahí importa el orden, no ver todo.
- **Cerca del platino** es `lib/library/near-platinum.ts` (puro, sin `server-only`): más del
  80% (estricto) y sin cerrar, ordenado por %, tope 12. "Sin cerrar" es sin el platino en PSN
  (un juego al 95% con el platino ya ganado por un DLC no está "cerca" de nada) y no estar al
  100% en Steam. Sale de las mismas stats de `get_library_trophy_stats()` que ya trae la
  página; `getCachedRecommendations` y `getPlaySuggestion` también las reusan en vez de correr
  el RPC otra vez.
- `PosterRowItem` toma desde `sm` el ancho de una columna de la grilla (4 en `sm`, 6 en `lg`),
  así un carrusel y la grilla de abajo alinean sus carátulas. En mobile sigue el ancho fijo que
  deja asomar media carátula.
- **Reseñas (`/biblioteca/resenas`)**: `lib/friends/reviews.ts` (`getFriendReviewsPage`) trae
  sólo entradas de amigos **con reseña escrita** (las de sólo rating van a Actividad, #195),
  con los likes de la página ya resueltos. Columna de lectura `max-w-2xl` también en
  escritorio. `components/friends/FriendReviewFeed.tsx` reemplaza a `FriendsDiaryFeed`
  (borrado): nombre del juego en `type-headline` (la serif al tamaño de una fila, utilidad
  nueva) + año, estrellas en `rating-muted`, corazón, autor con avatar a la derecha (link al
  perfil), carátula y reseña en `type-review` cortada a 6 líneas.
- **La fila ya no es un link entero**: título, autor, carátula, corazón y "Leer más" tienen
  cada uno el suyo. La carátula repite el link del título, así que va con `tabIndex={-1}` y
  `aria-hidden`.
- **"Leer más" sólo aparece si el texto se cortó**, medido en el cliente (`scrollHeight` contra
  `clientHeight` con un `ResizeObserver`): cuántas líneas ocupa depende del ancho, no del largo
  del string. Lleva a `/juegos/[id]?resena=<id>#resena-<id>` (`lib/game-page/review-focus.ts`):
  la tab Reseñas de la ficha marca esa fila (barra de acento + `aria-current`) y el `#` la trae
  a la vista sin JS, mismo criterio que el `?trofeo=` del advisor.
- **Paginación con cursor de keyset** (`lib/friends/review-cursor.ts`, puro) sobre
  `finished_on desc, created_at desc, id desc`, no con offset: si un amigo registra algo
  mientras leés, un offset repetiría una reseña. El cursor viaja por el cliente y termina en un
  filtro `or` de PostgREST, así que `decodeReviewCursor` valida cada campo (fecha, timestamp
  sin `",()`, uuid) y devuelve `null` ante cualquier otra cosa. "Cargar más" es la Server
  Action `loadMoreFriendReviews` y **suma** la página debajo (un link con `?cursor=` la
  reemplazaría); no es scroll infinito, y el foco pasa a la primera reseña nueva.
- `AddFriendModal` acepta `label`: el estado vacío sin amigos lo usa como "Buscar amigos".

## Biblioteca › Listas y listas pregeneradas (epic #183, issue #192)

La tab Lists de Letterboxd: primero lo de tus amigos, después lo que arma Platinoob con datos.

- **`/biblioteca/listas`**: tres secciones, en este orden. **Nuevas de tus amigos** son las
  listas públicas de la gente que seguís, la más nueva primero (`getFriendsLists`). **Armadas
  por Platinoob** son las pregeneradas (`getSystemListRows`). **Populares esta semana** son las
  listas públicas con más likes de los últimos 7 días (`getPopularListsThisWeek`), y la sección
  aparece sólo si hay al menos 3. Las dos primeras se muestran siempre, con un `EmptyState` si
  no tienen nada: el orden de la pantalla no depende de los datos.
- **`components/lists/ListRow.tsx`**:
  - arriba, el título en `type-subtitle` y el autor con su avatar; en una pregenerada, el
    autor es "Platinoob" con el ícono de la app;
  - abajo, la **tira de 8 pósters**: pegados a ancho completo en mobile y, desde `sm`, de
    tamaño fijo y solapados un 30%;
  - al final, la descripción cortada a 3 líneas.

  Toda la fila es **un solo link**, así que el autor no linkea a su perfil: un link adentro de
  otro es HTML inválido. `ListRowData` es la misma forma para una lista de usuario y para una
  pregenerada (`author: null` y `likeCount: null` en la pregenerada).
- **Pregeneradas globales** (`mejor-puntuados`, `mas-jugados`, `platinos-fin-de-semana`,
  `maratones`, `mejor-de-<año>`):
  - Se cachean en `system_lists` + `system_list_items` (migración
    `20260925000000_system_lists.sql`), que se leen con cualquier sesión y no tienen policies
    de escritura.
  - Las recalcula `refresh_system_lists(min_ratings, min_items, max_items)`: plpgsql, **una
    sola transacción** (borra y reinserta) y execute **sólo para `service_role`**.
  - Las constantes vienen del código (`MIN_RATINGS_FOR_AVERAGE`, `MIN_SYSTEM_LIST_ITEMS` = 5,
    `MAX_SYSTEM_LIST_ITEMS` = 50) para no duplicarlas en SQL.
  - "Jugado" es la definición del epic: platino, 100% en Steam o entrada de diario, sin contar
    dos veces al mismo usuario. "Los más jugados" exige al menos 2 jugadores. La función lee
    `user_trophies` de todos, pero sólo expone conteos por juego.
- **La base guarda sólo el slug.** Título, descripción, si es ranking y el orden en la tab viven
  en `lib/lists/system-catalog.ts` (puro); "Lo mejor de <año>" sale del slug.
- **`system_lists.item_count`**: la tab trae sólo las primeras 8 carátulas de cada lista, porque
  PostgREST corta en 1000 filas y con varios años se pasaba. Si un juego se borra después del
  cálculo (cascada), el conteo se corrige con las carátulas que llegaron.
- **Personalizadas** (`populares-entre-amigos`: lo que más registró en su diario la gente que
  seguís; `tu-playlist-corta`: la Playlist con el orden de `?orden=tiempo`): se calculan al
  vuelo en `lib/lists/system.ts`. Son baratas y dependen de quién mira.
- **Una lista con menos de 5 juegos no se muestra**: ni en la tab ni en su ficha, que da 404.
  El issue pedía "≥ 3" para la de Playlist, pero la regla general de 5 la incluye.
- **El cron**: `/api/cron/sync` corre el refresco como **último paso**, en su propio try/catch
  (un sync fallido no deja las listas sin refrescar, y un refresco fallido no tira abajo el
  sync). No se agregó un segundo cron. `?paso=listas` corre **sólo** ese paso, con el mismo
  `CRON_SECRET`: así lo usan los tests, porque el cron entero sincronizaría las cuentas reales
  con los mocks.
- **Ficha `/listas/sistema/[slug]`**: la misma UI que una lista de usuario, sin editar ni likes.
  `components/lists/ListGames.tsx` (`ListGames` + `ListProgress`) salió de `/listas/[id]` y lo
  usan las dos fichas. En la nav, `/listas/sistema` cuenta como Biblioteca, no como Perfil
  (`notActiveOn` en `nav-links.ts`).
- `NewListButton`: el `hidden` va en un envoltorio `hidden sm:contents`. Puesto en el link,
  perdía contra el `inline-flex` de `buttonClassName` y en mobile se veían el botón y el FAB.

## Estudios (epic #183, issue #193): `lib/igdb/` y `lib/studios/`

"Buscar por productora": abrir Insomniac y ver lo que hizo. **Sólo estudios de IGDB**
(desarrolladoras y publishers); nada de personas, que IGDB no tiene y no se inventan con IA.

- **`lib/igdb/`** es el único lugar que habla con IGDB (misma regla de aislamiento que
  `lib/psn/`): `client.ts` (token de Twitch cacheado + `igdbQuery`), `games.ts`
  (`resolveIgdbGame`, `fetchIgdbGameDetails`), `companies.ts` (`fetchGameCompanies`,
  `fetchCompany`, `fetchGamesByIds`) y `mocks.ts` (`E2E_MOCKS`, leído sólo acá). Todo devuelve
  `ok` / `not_found` / `unavailable`, y **un `unavailable` no se cachea**.
- **Tablas** (migración `20260926000000_companies.sql`): `companies` (`igdb_id` y `slug`
  únicos, logo, descripción, país en español, `parent_igdb_id`, y `games_cache` jsonb con los
  juegos desarrollados/publicados ya resueltos) y `game_companies` (`game_id`, `company_id`,
  `role` developer/publisher/porting/supporting). Más `games.igdb_id` (no único: PSN y Steam
  pueden ser dos filas del mismo juego) y `games.companies_checked_at`, con la misma lógica que
  `time_estimates_checked_at`. Lectura pública; **escritura sólo service role**.
- **Estudios de un juego**: `getGameCardData` los pide la primera vez que se abre la ficha
  (`syncGameCompanies`, `lib/studios/store.ts`), reusando el match de los tiempos. El hero los
  muestra como links; sin estudios, queda la desarrolladora en texto de RAWG.
- **Perfil `/estudios/[slug]`** (tabs Desarrollados / Publicados por ruta): logo o iniciales,
  nombre en `type-display`, país, "Parte de X" linkeable. Los juegos salen del `games_cache`
  (se refresca cada 30 días; si IGDB falla se muestra el viejo) y **se muestran aunque no estén
  en `games`**: el póster linkea a `/juegos/igdb/[igdbId]`, que materializa la fila
  (`materializeIgdbGame`, `external_catalog_id = 'igdb:<id>'` para reusar su índice único) y
  redirige. Orden en `?orden=` (`anio` / `puntuados` / `nombre`, `lib/studios/sort.ts`, puro),
  "Vos jugaste N de M" y tilde "Jugado" con el mismo criterio que las listas
  (`getPlayedGameIds`), cruzando por `games.igdb_id`. Cuenta como sección Buscar en la nav.
- IGDB publica el país como ISO numérico: `lib/studios/country.ts` lo traduce con una tabla
  chica + `Intl.DisplayNames`; uno que no esté no se muestra.
- **Backfill** de los juegos viejos: `scripts/backfill-companies.mjs` llama por tandas a
  `/api/cron/sync?paso=estudios` (no lo corre el cron diario), que usa la misma lógica con
  concurrencia 2 y pausas para no pasar los 4 req/s de IGDB.
- En E2E, los ids de IGDB de test viven arriba de `E2E_IGDB_ID_MIN` (900.000.000) y el
  teardown limpia `games` y `companies` por ahí.

## Buscar (epic #183, issue #194): `lib/search/`

El segundo botón de la barra. `/buscar` sin query muestra el campo enfocado y **Búsquedas
recientes**; con query (≥ `MIN_QUERY_LENGTH`, con debounce) muestra tabs **Todo · Juegos ·
Estudios · Listas · Usuarios**, con todo en la URL (`/buscar?q=insomniac&en=estudios`). Sólo se
consulta la tab abierta.

- **Todo es la default** (sin `en`): hasta 5 resultados por ámbito con "Ver todo" a su tab, en
  paralelo. Estudios ahí sale sólo de `companies` (IGDB es la consulta lenta; la tab Estudios
  sí lo consulta).
- **El campo no se pisa con el eco de la URL** (`SearchBox`): guarda la última búsqueda que
  pidió (`requested`) y sólo sigue a la URL cuando cambia desde afuera (una reciente, "atrás").
  Antes, la respuesta de "insom" llegaba mientras el usuario ya iba por "insomniac" y le borraba
  lo tipeado. Los resultados van en un `Suspense` propio y **no hay `loading.tsx`**: con él,
  cada búsqueda podía reemplazar la pantalla entera, campo incluido.
- `/buscar/ir` guarda la reciente con `after()`: el redirect sale sin esperar a la base.

- `lib/search/scopes.ts` (puro): ámbitos (`todo` es lo del header, abre Juegos), `searchHref`,
  `saveAndGoHref` y `safeInternalPath`. `queries.ts` (server-only): `searchGames` (`searchCatalog`
  con lo de tu biblioteca primero; lo de RAWG linkea a `/juegos/catalogo/[rawgId]`),
  `searchStudios` (`companies` + `searchCompanies` de `lib/igdb/`, que va por `name ~ *"…"*`
  porque IGDB no indexa estudios en `search`), `searchLists` (pregeneradas por título +
  `searchPublicLists`, **sólo públicas**) y `getRecentSearches`. Usuarios reusa `searchUsers`,
  con `FollowButton` en la fila.
- **`recent_searches`** (migración `20260927000000_recent_searches.sql`): unique
  `(user_id, lower(query), scope)`, RLS sólo el dueño para todo. Como el unique es una
  expresión, PostgREST no lo puede usar de `onConflict`: guardar es la función
  `save_recent_search` (security invoker), que hace el upsert y recorta a
  `MAX_RECENT_SEARCHES` (20).
- **Se guarda sólo al apretar Enter o al abrir un resultado**, nunca por tecla, y siempre por
  `/buscar/ir` (route handler que guarda y redirige a `to`, o a los resultados). Es un GET que
  escribe: los links a esa ruta son `<a>` comunes, **nunca `<Link>`**, que la prefetchearía y
  guardaría búsquedas que nadie abrió (`ListRow` acepta `prefetch={false}` por eso). `to` pasa
  por `safeInternalPath` (sin open redirect).
- `SwipeTabs` acepta `activeHref`: acá las cuatro tabs son la misma ruta con otro `?en=`.
- El header de escritorio abre un popover al enfocarse, con las recientes (se piden recién ahí
  con `getMyRecentSearches`) y "Ver todos los resultados".
- Fuera por ahora: deslizar una reciente para borrarla (está el ✕) y el estudio en la fila de
  un juego (saldría de una consulta a IGDB por resultado).

## Actividad (epic #183, issue #195): `lib/activity/`

El cuarto botón: un log de frases, como la Activity de Letterboxd. Tabs **Amigos**
(`/actividad`), **Vos** (`/actividad/vos`) y **Recibido** (`/actividad/recibido`).

- **Sin tabla de eventos**: cada tab es un RPC (`get_activity_friends` / `_self` /
  `_received`, migración `20260928000000_activity_feed.sql`) que hace `union all` sobre las
  tablas fuente. El log no puede divergir de los datos y borrar algo lo saca del log. `security
  invoker` + `auth.uid()`. Si el de amigos se pone lento con datos reales, recién ahí evaluar
  una tabla `activity_events` con triggers.
- **Amigos es sólo diario** (con o sin reseña). Nunca platinos: salen de `user_trophies`, que
  sólo los ve su dueño, y además `activity_is_user_entry` descarta las entradas que creó el
  sync (`platinum_sync` / `completion_sync`) sin rating ni reseña, que serían un platino ajeno
  por la puerta de atrás.
- **Vos**: registros, platinos, 100% de Steam (`completed_at`), "empezaste a jugar"
  (`now_playing`), Playlist, listas creadas/actualizadas (actualizada = `updated_at` más de un
  minuto después de crearla) y likes dados. **Recibido**: likes a lo tuyo y "empezó a seguirte".
- El `id` de cada evento es `<kind>:<uuid>` y el cursor es `(occurred_at, id)`
  (`lib/activity/format.ts`, puro): orden total aunque dos tablas coincidan en el instante.
  30 por página con "Cargar más" (`loadMoreActivity`), mismo patrón que Biblioteca › Reseñas.
- Filtro por tipo en `?tipo=` (links, no estado), sólo en Vos y Recibido.
- Fila: avatar · frase con nombres en 600 linkeables · tiempo relativo en `ink-faint`. La fecha
  del diario sale de `formatDiaryDate` (partes del string + `Date.UTC`, nunca `new
  Date("YYYY-MM-DD")`). En el platino el avatar se reemplaza por `public/trophy-platinum.webp`,
  el trofeo oficial que aportó el dueño del proyecto (el mismo de `public/trophies/platinum.png`,
  en WebP de 256px).

## Perfil › Perfil (epic #183, issue #196)

La tab principal del quinto botón, en el orden de la app de Letterboxd: cabecera (avatar
centrado y bio en mobile; la banda degradada queda sólo en escritorio), **Favoritos** (el Top 5
de siempre), **Jugando ahora** (sólo si hay algo), **Últimas reseñas** (5 pósters con estrellas
y el ícono `note` si hay texto, más "Ver todas tus reseñas"), **Tus puntuaciones** y
**Estadísticas**. En `lg` las dos últimas van en un sidebar; el orden del DOM es el de mobile.

- **`users.bio`** (160 caracteres, migración `20260929000000_users_bio.sql`, también en
  `public_profiles`): se edita en **Configuración › Perfil** (`saveBio`, doble capa con el
  `check` y `users_update_own`). `MAX_BIO_LENGTH` vive en `lib/profile/constants.ts`.
- **`lib/profile/stats.ts` es puro** (se testea desde el spec): histograma de 10 escalones de
  media estrella con el **último rating puntuado** de cada juego (criterio de `game_scores`),
  `entriesForRatingStep` (el filtro de `/perfil/resenas?rating=N`, mismo criterio para que la
  barra y la lista coincidan), `summarizePlayed` ("jugado" = platino, 100% o diario, sin contar
  dos veces) y los años. Una `date` se corta como string; un `timestamptz` (platino, 100%) se
  resuelve en **`APP_TIME_ZONE`** (Buenos Aires), no en la zona del proceso: en Vercel es UTC
  y corría a enero los platinos de la noche del 31/12.
- `lib/profile/summary.ts` (`getOwnProfileSummary`, con `cache()`) junta diario + platinos
  (`user_trophies`, privado: **sólo perfil propio**) + 100% (`game_diary_entries.completed_at`)
  y lo comparten la pantalla y los expandidos. `lib/profile/overview.ts` tiene los contadores
  (`getProfileCounts`), seguidores, likes dados y la bio.
- **Estadísticas** (`ProfileStatsMenu`, filas con chevron): Juegos jugados, Platinos, 100% en
  Steam (sólo con Steam o algún 100%), Diario, Reseñas, Playlist, Listas, Likes, Siguiendo,
  Seguidores y Resumen del año. Platinos y 100% **nunca se suman**. Los expandidos
  (`/perfil/jugados`, `/platinos`, `/completados`, `/resenas`, `/likes`, `/siguiendo`,
  `/seguidores`) viven en el grupo `app/(app)/perfil/(expandidos)/`, **fuera** de las
  `SwipeTabs` de `(propio)`: no son tabs. El nivel de PSN y la `TrophyTypeStrip` se mudaron al
  expandido de Platinos.
- **Perfil como PSN o Steam**: `users.profile_platform` (`psn` / `steam` / NULL = automático,
  migración `20261001000000_users_profile_platform.sql`). `public_profiles` la resuelve en
  `profile_platform`, `profile_name` y `profile_avatar_url`: con una sola cuenta conectada se
  usa esa (sólo Steam → nombre y foto de Steam), con las dos se respeta la elección (default
  PSN). Todo lo que muestra el nombre o la foto de un usuario lee esas columnas, nunca
  `psn_online_id` / `avatar_url` directo. Se elige en Configuración › Perfil, que muestra el
  selector sólo con las dos cuentas conectadas.
- `FriendsStrip` ya no está en el perfil propio (lo reemplaza Siguiendo) ni, desde #197, en
  el ajeno.

## Perfil › Diario / Listas / Playlist y perfil ajeno (epic #183, issue #197)

Cierra el epic. Las cuatro tabs del perfil (Perfil · Diario · Listas · Playlist) existen igual
para el propio (`app/(app)/perfil/(propio)/`) y para el de otro usuario (`/perfil/[id]/...`).

- **Diario** (`components/diary/DiaryTimeline.tsx`): el formato del diario de Letterboxd.
  Cabecera de mes **`sticky`** en versalitas sobre `surface-raised` a ancho completo y, por
  partida, una fila con el **día** en un recuadro `border-strong` (`type-stat`), carátula 3:4
  chica, nombre en la serif (`type-headline`) + año (`games.release_year`, nuevo en
  `DiaryTimelineEntry`) y las marcas: estrellas, `note`, platino / 100% y `repeat` si es
  rejugada. La fila entera linkea a la ficha con la entrada enfocada (`reviewFocusHref`). Los
  filtros siguen siendo client-side y en la URL; en mobile van en una `BottomSheet` detrás del
  ícono de filtro (con el globito de cuántos hay puestos), en escritorio en línea. Lo que se
  muestra sin entradas lo decide quien lo monta (`empty`): el propio invita a registrar.
- El **feed de amigos salió del diario** (`FriendsDiaryGrid` y `getFriendsDiaryFeed` se
  borraron): eso es Biblioteca › Reseñas y Actividad. "Resumen del año", "Importar capturas" e
  "Importar mis platinos" van en el menú ⋮ (`DiaryActionsMenu`, estado propio para cerrar al
  tocar afuera y con Escape, como el menú de cuenta). Íconos nuevos: `more` y `lock`.
- **Listas** (`components/lists/ProfileLists.tsx` + `getProfileListRows`): filas `ListRow`, la
  última editada primero. En el propio van las privadas con candado (`ListRowData.isPrivate`) y
  también las vacías; en el ajeno se piden **sólo las públicas de forma explícita**, aunque la
  RLS ya esconda las privadas. `ListCard` se borró.
- **Playlist**: `components/playlist/PlaylistView.tsx`, compartida; `PlaylistSection` (la fila
  del perfil ajeno) se borró.
- **Perfil ajeno** (`app/(app)/perfil/[id]/`): el `layout.tsx` monta las `SwipeTabs`
  (`otherProfileTabs`) y resuelve el contexto con `getOtherProfileContext`
  (`lib/profile/other.ts`, con `cache()`: sin sesión al login, el id propio a `/perfil`, sin
  perfil 404). Mismas secciones que el propio, sin editores ni engranaje, con **Seguir /
  Siguiendo** (`FollowButton`, `aria-pressed`). Las estadísticas son **sólo públicas**:
  "Juegos jugados" cuenta el diario y "Platinos" es el `earned_platinum` de `public_profiles`,
  y cada fila lo aclara (`ProfileStatRow.note`); sin 100%, likes ni seguidores (la RLS de
  `friendships` sólo deja ver las filas donde participa quien mira). El histograma va sin links
  (`linkToReviews={false}`): `/perfil/resenas` es del propio.
- `DiaryPreviewSection` se borró: las dos pantallas usan `RecentReviewsSection`, con `tone`.

## Galería online: publicaciones de fotos y videos (`lib/posts/`)

Publicaciones estilo Instagram: 1 a 10 fotos y videos (carrusel) de **un juego**, con descripción
opcional (2200) y marca de spoiler. Se ven en **Actividad › Galería online** (tuyas y de la gente
que seguís, `/actividad/galeria`), en la tab **Capturas** de la ficha (de todos,
`/juegos/[id]/capturas`) y en **Perfil › Galería** (`/perfil/galeria`, `/perfil/[id]/galeria`).
Reemplaza a la galería vieja de capturas (ver la sección del diario).

- **Nada es legible sin sesión**, ni las filas ni los archivos: todas las policies van
  `to authenticated` y el bucket `post-media` es **privado**. Las URLs se firman server-side en
  lote (`createSignedUrls`, 1 h) con la sesión de quien mira; la policy de lectura de
  `storage.objects` exige que el post sea visible. `/publicaciones` está en el matcher del
  middleware.
- **Tablas** (`20261004000000_posts.sql`): `posts` (`status` `uploading` / `published`,
  `published_at` ordena el feed, `edited_at`), `post_media` (`position` 0..9 + unique = tope de
  10; `storage_path` original, `display_path` derivado, `poster_path` de video, ancho/alto
  guardados para no saltar el layout), `post_likes` y `post_comments` (500). Un post
  `uploading` sólo lo ve su autor. El trigger `posts_guard_update` impide cambiar autor o juego,
  volver de `published` a `uploading` y **publicar sin archivos**, y marca `edited_at`.
  Comentarios: los borra su autor **o el autor del post**. **La propia publicación sí se likea**,
  como en Instagram (a diferencia de reseñas y listas; migración
  `20261004000400_post_likes_own.sql`), y ese like no llega a Recibido. **Sin contadores denormalizados**: `get_post_stats`
  cuenta likes y comentarios de los ids de una página en una consulta.
- **Publicar son tres pasos** (`lib/posts/actions.ts`): `createDraftPost` (post en
  `uploading`) → el navegador sube **directo a Storage por TUS** (`tus-js-client`, chunks de 6 MB
  como exige Supabase, con la sesión del usuario: los archivos nunca pasan por Vercel) a
  `{user}/{post}/{pos}-{uuid}.ext`, que es lo único que deja la policy de insert →
  `confirmPost` **revalida todo sin creerle al cliente**: paths del usuario y del post, que el
  objeto exista, tamaño real de la metadata de Storage, MIME y **magic bytes** (lee los
  primeros 64 bytes con un `Range` sobre una URL firmada, `lib/posts/sniff.ts`). Recién ahí
  inserta `post_media` y publica. Un archivo que falla se reintenta solo (TUS reanuda).
- **En el navegador, antes de subir** (`lib/posts/prepare.ts`): tipo real por magic bytes,
  **EXIF/GPS fuera sin recomprimir** (`strip-metadata.ts`: JPEG pierde APP1/APP13 y se le
  vuelve a escribir un EXIF mínimo con sólo la orientación, si no las fotos verticales de
  celular quedarían acostadas; PNG pierde eXIf/tEXt/iTXt/zTXt/tIME; WebP pierde EXIF/XMP),
  derivado WebP de 1080 px para feed y grilla (el original queda intacto) y, para videos,
  comprobación de que **este** navegador lo decodifica + poster JPEG de un frame. **Sin
  limpiar**: AVIF y la ubicación que un video de celular puede traer en su átomo `udta`.
- **Formatos**: jpeg/png/webp/gif/avif y mp4/webm/mov. **HEIC se rechaza** con instrucciones
  (Chrome no lo dibuja; sin heic en el `accept`, iOS convierte a JPEG solo). Un `.mov` HEVC que
  Chrome no reproduce se rechaza al prepararlo.
- **Límites** (`lib/posts/constants.ts`, repetidos en el bucket): 20 MB por imagen y **50 MB por
  video, el tope del plan Free de Supabase**, que además tiene 1 GB de Storage para todo el
  proyecto. Si se pasa a Pro, se suben los números en los dos lados.
- **Detalle con URL propia**: `/publicaciones/[id]` es página (link compartido, recarga) y,
  navegando dentro de la app, un modal por parallel + intercepting routes
  (`app/(app)/@modal/(.)publicaciones/[id]`, con `default.tsx` y un catch-all que devuelven
  `null`). `RouteModal` cierra con Esc / ✕ / click afuera (`router.back()`) y atrapa el foco. Lo
  mismo para `/publicaciones/nueva`. Ojo: desde el compositor como **página**, ir al detalle es
  una navegación completa — una suave se interceptaría y dejaría el compositor debajo del modal.
- **Carrusel** (`PostCarousel`): scroll-snap nativo (SwipeTabs ya ignora un swipe que arranca en
  algo con `overflow-x`), flechas al hover y ← → (en el detalle, en toda la página), puntos y
  "2/7". El marco toma la proporción del **primer** archivo, acotada entre 4:5 y 16:9, y el
  resto va con `object-contain`. Los slides que no se ven van `inert`, no `aria-hidden`.
  **Un toque abre la pantalla completa y doble tap / doble click da like** (con el corazón que
  salta sobre la foto y el `@keyframes post-like-pop` en el botón, sin animación con
  `prefers-reduced-motion`). Para distinguirlos, el toque simple espera 300 ms
  (`DOUBLE_TAP_MS`) antes de abrir, y un movimiento de más de 10 px es un swipe, no un toque.
- **Pantalla completa** (`PostMediaViewer`, también desde el botón de expandir): siempre el
  **original** (por eso el feed también firma `storage_path`, no sólo el derivado). Pide
  `requestFullscreen` al abrir, porque el toque es el gesto que el navegador exige: en
  escritorio ocupa el monitor, en el celular vertical la foto queda ampliada a todo el ancho y
  al girarlo llena la pantalla sin barras. iPhone no tiene Fullscreen API para elementos: ahí es
  una capa fija de `100dvh`. Esc / ✕ / salir del fullscreen lo cierran; el keydown va en
  captura para que Esc no cierre además el modal del detalle.
  **Zoom** (`ZoomableImage`): pellizco y doble toque en el celular, rueda y doble click en
  escritorio, arrastre para moverse (hasta 4×). Sin zoom el área es `touch-action: pan-x` (el
  swipe entre archivos sigue siendo el scroll-snap nativo); ampliada pasa a `none` y el riel se
  bloquea. El pellizco se intercepta con listeners no pasivos: el `pinch-zoom` del navegador
  ampliaría la página entera. **Rotación**: el manifest fija la app instalada en vertical, así
  que el visor, ya en fullscreen, pide `screen.orientation.lock("any")` y lo libera al cerrar
  (sólo Chrome Android; en iPhone gira si el usuario no bloqueó la rotación).
- **Tarjeta del feed**: `rounded-card` + `border-strong` + `bg-surface` + sombra, con aire
  entre posts: con el hairline `border` los posts se fundían entre sí. Cada comentario lleva el
  avatar de su autor (`FriendAvatar`, el de PSN o Steam que eligió mostrar). **Video**: en el feed autoplay muteado sólo visible (IntersectionObserver) y sin
  `prefers-reduced-motion`; en la grilla nunca; siempre `preload="metadata"`.
- **Paginación numerada** (`?page=N`, 30 en el feed y 45 en la grilla, `lib/posts/pagination.ts`)
  con offset, a pedido del producto: linkeable y recargable. Una página de más redirige a la
  última. El costo conocido: si alguien publica mientras navegás, un post puede repetirse.
- **Avisos en Actividad › Recibido**: `post_like` y `post_comment` en `get_activity_received`
  (derivado, sin tabla de notificaciones: borrar el post se lleva sus avisos). El globito de no
  leídas sale de `count_unread_received()` contra `users.activity_seen_at`; entrar a Recibido
  llama a `mark_received_seen()`. Sin Realtime ni polling: `UnreadActivityProvider` lo recalcula
  al navegar y al volver la app a primer plano (`20261004000200_posts_received_activity.sql`).
  Lo pide a un **route handler** (`/api/actividad/no-leidas`) con `fetch`, **nunca con una
  Server Action**: las actions comparten una fila en el router de Next, y una que corre en cada
  navegación dejaba esperando a las de la pantalla y re-renderizaba la página en el medio.
- **Limpieza**: el paso `?paso=publicaciones` de `/api/cron/sync` (también al final de la corrida
  diaria) borra los posts que siguen en `uploading` después de 24 h y los archivos huérfanos
  (`post_media_orphans`, sólo `service_role`; se borran por la API de Storage, nunca por SQL).
  Borrar un post borra **primero los archivos y después la fila**: Storage sólo deja listar y
  borrar lo que la policy de lectura deja ver, y esa policy exige que el post exista (con la
  fila ya borrada, `remove` no borraba nada y no avisaba).
- **Moderación**: no hay. El compositor recuerda que es para contenido de juegos; una tabla
  `post_reports` con FK en cascada encaja sin tocar lo demás.

## Platino: el logro máximo (`lib/platinum/`, `components/platinum/`)

Un platino de PSN se destaca en toda la app. **Sólo PSN**: el 100% de Steam no es un platino y
conserva su propio badge (ver la sección de Steam).

- **Assets oficiales** en `lib/platinum/assets.ts`: `public/trophies/platinum.png` (ya
  commiteado, 512px cuantizado) y `public/sounds/platinum.mp3`, que **aporta a mano el dueño del
  proyecto** (son de Sony: no se descargan ni se generan, y si la app se hace masiva conviene
  reemplazarlos por diseño propio). Si falta alguno nada se rompe: `PlatinumTrophy` cae a
  `public/trophy-platinum.webp` y después a la copa vectorial, el sonido simplemente no suena, y
  en desarrollo sale un aviso en consola (una vez por asset).
- **Biblioteca**: `GamePoster` con `isPlatinum` lleva marco metálico (`.platinum-frame`), el
  trofeo en la esquina y el reflejo que cruza la carátula (`PlatinumSheen`: CSS puro con
  `transform`, pausado fuera de pantalla con **un único** IntersectionObserver compartido).
  Debajo, "Platinado el …" (fecha de `getPlatinums`), "A punto de platinar" con más del 80%, el
  orden "Platinados primero" y el contador `PlatinumCounter`, que lleva a la vitrina.
- **Ficha del juego**: `getGamePlatinum` (en `lib/game-page/data.ts`, sale de los trofeos que la
  ficha ya trae más un `count` para el "#N") alimenta `GamePlatinumShowcase`: el trofeo grande,
  número, fecha, rareza, días desde el primer trofeo y tu trofeo más raro. `GamePlatinumActions`
  vive en el **layout**, así que la lluvia (`PlatinumRain`, canvas, sin librerías, cargado con
  `dynamic()`) y el sonido salen **cada vez que se entra al juego**, no al cambiar de tab.
  "¡Otra vez!" la repite. En `TrophyList` el platino va separado arriba y no se repite abajo.
- **Celebración de platinos nuevos**: `user_trophies.celebrated_at` (migración
  `20261028000000_platinum_impact.sql`) **nace en `now()`**: todo lo viejo y todo trofeo que no
  sea un platino recién conseguido cuenta como ya celebrado. El sync de PSN la pone en NULL sólo
  si `shouldCelebratePlatinum` (`lib/platinum/celebration.ts`, puro): la fila es nueva, la
  cuenta ya tenía un sync previo (el primero es historia) y el platino es de los últimos 30 días.
  `PlatinumProvider` (en `app/(app)/layout.tsx`) pide la cola a `GET /api/platino/estado` al
  abrir la app, al volver a primer plano y tras un sync manual (`requestPlatinumCheck`), y marca
  cada una con `POST /api/platino/celebrado`. **Route handlers y no Server Actions**, por lo
  mismo que `/api/actividad/no-leidas`. La cola va de a uno ("1 de 3"), y si el navegador
  bloquea el audio aparece un botón para reproducirlo.
- **Vitrina** (`/vitrina`): `get_platinum_collection()` (security invoker, una fila por
  platino con su número, rareza y primer trofeo) y `lib/platinum/stats.ts` (puro) arman las
  stats (más raro, más rápido, mejor año), las repisas (`ShowcaseShelf`) y los huecos de "Tu
  próximo platino" (`getNextPlatinumCandidates`, mismo criterio que "Cerca del platino").
  Orden en `?orden=`. **Reemplaza a `/perfil/platinos`**, que redirige (`next.config.ts`), y se
  llevó el nivel de PSN y la `TrophyTypeStrip`. Cuenta como sección Perfil y está en el menú de
  cuenta; no tiene botón propio en la barra de 5.
- **Compartir en actividad**: `app/api/platino/[gameId]/tarjeta` dibuja la card "¡Platiné X!"
  (1080×1350) con `next/og`, sólo para un platino propio. `SharePlatinumDialog` la baja una vez,
  la muestra y la publica con `publishFiles(..., kind: "platinum")`: **el mismo flujo de tres
  pasos que cualquier foto**. `posts.kind` (`photo` / `platinum`) lo valida `createDraftPost`
  **y** el trigger `posts_guard_kind` (no se marca como platino un juego que no platinaste, y el
  tipo no cambia). El feed, la grilla y el detalle destacan esos posts con marco y badge.
- **Preferencias**: `users.platinum_sound_enabled` / `platinum_effects_enabled` (true por
  defecto), en Configuración › Perfil. El provider las refleja en `<html data-platinum-fx>`
  para que el CSS apague los reflejos sin JS. `prefers-reduced-motion` también apaga la
  lluvia, el reflejo y las animaciones de entrada; el marco y el halo fijos se quedan.

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
- `users.bio` — bio corta del perfil (160), pública vía `public_profiles`.
- `steam_accounts` — vínculo user ↔ Steam (steam_id64, persona_name, avatar, visibilidad del perfil,
  última sync). Planeado, ver sección de Steam arriba.
- `now_playing` — rachas de "Jugando ahora" (inicio, fin y motivo), públicas. Ver la sección de arriba.
- `user_playlist` — los juegos que el usuario quiere jugar, públicos. Ver la sección de Playlist.
- `user_lists` / `user_list_items` — listas de juegos, públicas o privadas. Ver la sección de Listas.
- `review_likes` / `list_likes` — me gusta en reseñas y listas. Ver la sección de Likes.
- `recent_searches` — búsquedas recientes, privadas, tope de 20. Ver la sección de Buscar.
- `system_lists` / `system_list_items` — listas pregeneradas globales, las recalcula el cron. Ver
  la sección de Biblioteca › Listas.
- `posts` / `post_media` / `post_likes` / `post_comments` — Galería online, sólo con sesión. Ver
  su sección.
- `user_trophies.celebrated_at`, `posts.kind`, `users.platinum_*_enabled` — celebración,
  posts de platino y preferencias. Ver la sección de Platino.
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
  El promedio es `numeric(4, 2)` desde `20260925000100_game_scores_precision.sql`: con el
  `numeric(3, 2)` original, un juego con todas sus valoraciones en 10 hacía fallar la vista
  entera ("numeric field overflow").
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
- El diario propio (`/perfil/diario`) ya no muestra el feed de amigos (#197): las reseñas de
  amigos viven en Biblioteca › Reseñas (`/biblioteca/resenas`, antes
  `/diario/amigos`, que redirige; ver "Biblioteca › Juegos y Reseñas"). El diario propio se
  mudó a `/perfil/diario` (epic #183).
- El fondo de `GameHero` es un backdrop a ancho completo de la ventana (w-screen + left-1/2 +
  -translate-x-1/2, con degradado al color de la página), tipo Letterbox. El wallpaper sale, en
  orden, de RAWG, del "hero" de SteamGridDB (`findHeroImageUrl`) y de la CDN pública de Steam
  (`findSteamHeroUrl`: `library_hero.jpg` del appid resuelto con la búsqueda pública de la
  store, **sin ninguna API key** -- por eso funciona aunque falten `RAWG_API_KEY` y
  `STEAMGRIDDB_API_KEY`). Si no hay ninguno, cae a la carátula difuminada. El backdrop va con
  `z-0` y el contenido con `z-10`: con `-z-10` quedaba detrás del `bg-zinc-950` de la página y
  no se veía.
- **Galería de capturas → Galería online.** La galería vieja (`game_screenshots`, bucket
  público `game-screenshots`) se reemplazó por la Galería online (ver su sección): cada captura
  pasó a ser una publicación (`scripts/migrate-screenshots-to-posts.mjs`) y la tabla se dropea
  en `20261004000300_drop_game_screenshots.sql`, que se niega a correr si queda alguna sin
  migrar. Sony **no expone la galería de capturas de PSN** por ninguna API usable — `psn-api`
  no la cubre y el GraphQL interno de la PS App cambia sus hashes de `persistedQuery` en cada
  release —, así que siguen siendo subidas a mano.
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
  Lo detectado se **publica en la Galería online**: un carrusel de hasta 10 capturas por juego
  (`publishFiles` en `lib/posts/publish-files.ts`, el mismo flujo de tres pasos que el
  compositor), con tope `MAX_FILES_PER_IMPORT`.
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
  imágenes. **Las fotos que suben los usuarios (Galería online) también van por
  `GameArt`**: el feed y la grilla muestran un derivado WebP que se genera **al subir**, en el
  navegador, y sólo el detalle carga el original. Si algún día hace falta bajar más ese peso,
  el camino sigue siendo transformar **al subir** (redimensionar en el
  browser antes del upload), no el optimizador.
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

## Recomendaciones de IA (`ai_recommendations`)

Sección "Recomendados para vos" en Biblioteca › Juegos (`/biblioteca`, desde el issue #191;
antes vivía en el diario): qué **seguir jugando**
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
  route; sigue en esa carpeta aunque la sección se mudó) y hace
  `revalidatePath("/biblioteca")`: por eso `RecommendationsSection.tsx` renderiza la
  lista desde las props del server y usa estado local solo para el error y el pending.
- **"Seguí jugando" no repite "Cerca del platino"**: la sección recibe los ids de esa fila
  (`excludeGameIds`) y los esconde, y los candidatos que se le mandan a la IA ya excluyen lo
  que está a más del 80%. La ✕ de cada carátula saca el juego (`dismissKeepPlaying`,
  migración `20260930000000_user_games_keep_playing_dismissed.sql`):
  `user_games.keep_playing_dismissed_at` guarda el `last_played_at` del juego en ese
  momento, y mientras el sync no traiga una sesión posterior se filtra al leer la última
  generación y no es candidato. **Si lo vuelve a jugar, vuelve solo** (decisión de producto).
- Los juegos de "Para probar" no existen en `games` (el usuario no los tiene), así que van como
  tarjetas de texto y no como grilla de carátulas: no hay ficha adónde linkear.

## Perfil: Top 5 y perfil público (`user_favorite_games`, `/perfil/[id]`)

Rediseño del 2026-09-13. El perfil dejó de ser una tira de números con
"Jugados recientemente" abajo: ahora arranca con una portada (`ProfileHeader`,
la única pantalla de la app con banda degradada), la tira de stats, y después
lo que el usuario **elige** mostrar.

- **Se sacó "Jugados recientemente"**: repetía lo que ya es `/juegos` (que
  además está a un tap) y no decía nada del usuario. Lo reemplaza el **Top 5**,
  que sí es una decisión suya. Por eso el perfil ya no consulta
  `user_games.last_played_at`.
- `user_favorite_games` (migración `20260913000000_profile_favorites.sql`) es
  `user_id + game_id + slot` (1..5), con `unique (user_id, slot)`. La Server
  Action `app/(app)/perfil/actions.ts` **reescribe la lista entera** (delete +
  insert) en vez de actualizar casilleros: cualquier reordenamiento pasaría por
  un estado intermedio con dos juegos en el mismo `slot` y ese unique lo
  rechazaría. Doble capa igual que la autoría de guías: la action valida que los
  juegos estén en `user_games` del usuario **y** la RLS exige
  `user_id = auth.uid()`.
- La RLS de select es `using (true)`, igual que `game_diary_entries`: el Top 5
  es justamente lo que muestra un perfil público.
- **El Top 5 no se limita a la biblioteca sincronizada.** El editor filtra la
  biblioteca del usuario y, cuando nada coincide, busca en el catálogo
  (`searchCatalog`) y da de alta el juego elegido con `addCatalogGame` — el
  mismo camino que "Marcar como terminado", incluso cuando la fila de `games`
  ya existe porque la sincronizó otro usuario: sin pasar por ahí el juego no
  queda en `user_games` y la Server Action lo rechaza al guardar. Por eso
  `searchCatalogGames` **ya no descarta lo que no está en PlayStation**: con
  Steam como segunda plataforma, ese filtro dejaba afuera juegos de PC y buena
  parte del catálogo histórico (el caso que lo destapó fue Minecraft). Las
  plataformas ahora **ordenan** los resultados (PlayStation, después PC), no los
  filtran.
- El campo de búsqueda del editor va con debounce y `components/Modal.tsx`
  enfoca la ✕ **solo al abrir**: su effect dependía de un `onClose` inline, que
  cambia de identidad en cada render, así que cada tecla tipeada adentro de
  cualquier modal robaba el foco (en mobile, cerrando el teclado).
- El editor (`components/profile/TopFiveEditor.tsx`) recibe la biblioteca por
  props del Server Component — es la misma consulta que el perfil ya hacía para
  contar juegos, así que filtrar en el cliente no cuesta un round-trip — y el
  **orden de selección es el orden del Top 5**: para cinco elementos alcanza, no
  hace falta drag & drop. `MAX_FAVORITE_GAMES` vive en `lib/profile/constants.ts`
  y no en `queries.ts` porque ese módulo es `server-only` (misma razón que
  `lib/catalog/constants.ts`).
- **`/perfil/[id]` es el perfil de otro usuario**, con las mismas cuatro tabs que
  el propio (ver la sección de #197): su Top 5, jugando, sus últimas reseñas, su
  histograma y estadísticas públicas.
  Todo eso es público por diseño. Lo que **no** se puede mostrar es cualquier
  número derivado de `user_trophies` (privado): no hay progreso por juego ni
  "juegos en biblioteca", que desde la sesión del que mira darían cero. `/perfil`
  y `/perfil/[id]` comparten los componentes de `components/profile/`; lo único
  exclusivo del propio es el editor del Top 5, el email y las acciones de cuenta.
  Un link a `/perfil/<el id propio>` redirige a `/perfil`.
- `public_profiles` suma `trophy_level`, `trophy_progress` y los cuatro
  `earned_*`. Sigue siendo SECURITY DEFINER, así que **cada columna nueva expone
  un dato que la RLS de `psn_accounts` no dejaría leer**: estos son los que
  cualquiera ve en un perfil de PSN, y nunca el `npsso_encrypted`, el
  `account_id` ni el email. La vista se **dropea y se recrea** (no
  `create or replace`): cambiar la lista de columnas no se puede reemplazar en
  caliente, y la definición arranca de la de `20260823010000` para no perder las
  columnas de Steam.
- Se llega al perfil de un amigo desde la fila de amigos del perfil propio
  (`FriendsStrip`), desde el autor de cada reseña de Biblioteca › Reseñas y desde
  el "Ver perfil" del buscador de "Agregar amigo".

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
- **Ningún error crudo de la base llega al cliente** (#165): una Server Action, un route handler o una página no arman su mensaje con `${error.message}`. `lib/errors.ts` tiene `logDbError` (detalle al log del server) y `dbErrorMessage(scope, error, "Texto propio.")`, que loguea y devuelve el texto para el usuario. SEC-10 lo verifica sobre el código.
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
11. Remake visual (issue #176): sistema de diseño propio con Letterboxd como referencia, para
    que la app deje de parecer generada por IA. 🔄 **Fases 1 a 4 completas**: fundaciones
    (tokens con rol explícito, escala tipográfica `type-*`, la segunda familia serif, el set
    de íconos y la auditoría de contraste), primitivas (`Button`, `Input`, `StatCard`,
    `ProgressBar`, `Modal`, los badges, `components/ui/*` y `GamePoster`) y biblioteca + ficha
    de juego (`/juegos`, `/juegos/[id]`, `TrophyList`/`TrophyItem`, `GameDetailHero`,
    `AiAdvisorPanel`, más los tokens de rareza) y el diario completo (`/diario` y sus
    subpantallas, `/juegos/[id]/diario`, `GameHero`, `StarRating`, con las reseñas en la
    serif de lectura). Faltan las fases 5-6 (perfil/configuración/chrome, barrido final con
    el lint que prohíbe los colores literales). Ver el issue para el detalle por pantalla.

12. Platinoob como Letterboxd (epic #183): navegación de 5 tabs, listas, playlist, jugando
    ahora, estudios (IGDB), actividad y perfil nuevo, en 14 sub-issues (#184-#197). ✅
    **#184 completo**: paleta refinada (chrome, superficies a pasos parejos, `rating` /
    `rating-muted` / `like`). **#185 completo**: shell de navegación de 5 botones, header
    web, `SwipeTabs`, rutas nuevas con placeholders y redirects. **#186 completo**: ficha de
    juego unificada con tabs y panel de acciones, que abre cualquier juego del catálogo. **#187
    completo**: "Jugando ahora" (`now_playing`, el + con sugerencia, perfil, biblioteca y
    ficha). **#188 completo**: Playlist (`user_playlist`, toggle optimista en la ficha,
    `/perfil/playlist` con órdenes, salida automática al jugar o terminar). **#189 completo**:
    listas (`user_lists` / `user_list_items`, editor, ficha con "Vos jugaste N de M" y
    "Agregar a una lista"). **#190 completo**: likes en reseñas y listas (`review_likes` /
    `list_likes`, corazón optimista). **#191 completo**: Biblioteca › Juegos por secciones
    (Jugando ahora, recomendaciones de IA, Cerca del platino, la grilla) y › Reseñas (feed de
    reseñas de amigos con cursor y "Cargar más"). **#192 completo**: Biblioteca › Listas
    (amigos, pregeneradas y populares de la semana), `system_lists` refrescadas por el cron y
    ficha `/listas/sistema/[slug]`. **#193 completo**: estudios de IGDB (`lib/igdb/`,
    `/estudios/[slug]`, estudios linkeables en la ficha). **#194 completo**: Buscar con tabs por
    ámbito y búsquedas recientes (`recent_searches`, popover en el header). **#195 completo**:
    Actividad (Amigos / Vos / Recibido) derivada por RPC, sin tabla de eventos. **#196
    completo**: Perfil › Perfil (favoritos, histograma, estadísticas y expandidos). **#197
    completo**: Perfil › Diario / Listas / Playlist con el formato de Letterboxd y el perfil
    ajeno con las mismas cuatro tabs. ✅ **Epic completo.**

13. Galería online: publicaciones de fotos y videos con feed en Actividad, tab Capturas en la
    ficha y en el perfil, detalle con URL propia, likes, comentarios y avisos en Recibido. ✅
    Reemplaza a la galería de capturas vieja.

14. Impacto del platino: carátula premium, ficha del platino con lluvia, celebración de
    platinos nuevos, Vitrina, card "¡Platiné X!" en la Galería y preferencias. ✅

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

- `SUPABASE_SERVICE_ROLE_KEY`: **requerida para sincronizar PSN y Steam** (y para el cron). El sync de PSN la usa para leer el NPSSO (#130) y los dos escriben con ella el catálogo compartido (`games`/`trophies`/`trophy_groups`, #164), que `authenticated` ya no puede escribir. Sin ella, el sync manual responde el 500 genérico y el log dice qué falta. Nunca con prefijo `NEXT_PUBLIC_` ni en una ruta que use la sesión del usuario para otra cosa que eso.
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
