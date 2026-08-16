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
```
