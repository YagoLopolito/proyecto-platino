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

## Guías de desbloqueo: enfoque

No existe una API de "guías de trofeos". Dos caminos, no excluyentes:

1. **Curación propia**: guías escritas/editadas dentro de la app (markdown), asociadas a `game_id` / `trophy_id`. Es el contenido más confiable y evita temas de scraping.
2. **Enlaces a fuentes externas**: guardar links a guías existentes (PowerPyx, PSNProfiles, TrueTrophies, foros, YouTube) en vez de copiar su contenido. Citar siempre la fuente. **No scrapear sitios de terceros sin revisar sus términos de uso** — si se integra algo automatizado, priorizar fuentes con RSS/API propia antes que scraping.

## Modelo de datos (borrador)

- `users` — cuenta de la app (Supabase Auth).
- `psn_accounts` — vínculo user ↔ PSN (online_id, account_id, npsso cifrado, estado del token, última sync).
- `games` — catálogo de juegos (np_comm_id, nombre, ícono, plataforma).
- `trophies` — trofeos por juego (nombre, descripción, tipo, ícono, oculto/no).
- `user_trophies` — trofeos obtenidos por usuario (fecha de desbloqueo, viene de sync PSN).
- `guides` — guía por juego (autor, contenido markdown o link externo, fuente).
- `guide_steps` — pasos de una guía, opcionalmente ligados a un `trophy_id`.
- `user_guide_progress` — checklist de pasos completados por el usuario, independiente de si el trofeo ya sincronizó.

## Convenciones de código

- TypeScript estricto, sin `any` salvo en boundaries de librerías externas.
- Toda llamada a `psn-api` vive en `lib/psn/`, nunca directo en componentes ni en rutas sueltas.
- Server Components por defecto; Client Components solo donde haya interactividad real.
- Variables sensibles (NPSSO, service role key de Supabase) solo en variables de entorno server-side, nunca prefijo `NEXT_PUBLIC_`.

## Roadmap sugerido

1. Auth + esquema base en Supabase.
2. Conexión de cuenta PSN (input de NPSSO) + primer sync manual de trofeos.
3. Vista de perfil: juegos, % completitud, trofeos por juego.
4. Sync automático (cron) + manejo de expiración de token.
5. Guías propias (CRUD simple) ligadas a juegos/trofeos.
6. Checklist de guía cruzada con trofeos ya obtenidos.
7. Enlaces a guías externas curadas.

## Variables de entorno esperadas

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PSN_TOKEN_ENCRYPTION_KEY=
RAWG_API_KEY=
```

- `PSN_TOKEN_ENCRYPTION_KEY`: requerida para conectar cuentas PSN (cifra el NPSSO en reposo). 32 bytes en base64 — generar con `openssl rand -base64 32`.
- `RAWG_API_KEY`: opcional. Sin ella, `lib/covers` no completa carátulas y el sync sigue funcionando igual con los íconos que trae PSN.
