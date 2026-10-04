# Testing PRD — QA end-to-end con Playwright

> Documento de referencia para el issue [#30 — QA end-to-end del flujo completo](https://github.com/YagoLopolito/proyecto-platino/issues/30).
> **Este documento se sigue al pie de la letra.** Cualquier test nuevo debe encajar en la
> estructura, las convenciones de selectores y la estrategia de datos definidas acá. Si algo
> no encaja, se actualiza primero este documento y recién después el código.

Fecha: 2026-08-22 · Milestone: Fase 10 — Pulido y deploy productivo

---

## 1. Objetivo y alcance

### 1.1 Qué se quiere lograr

Cubrir con tests automatizados el flujo completo que describe el issue #30:

```
Registro → login → conexión PSN → sync de trofeos → biblioteca → detalle de juego
        → guías propias (CRUD + checklist) → enlaces externos → advisor con IA
        → diario (Letterbox) → amigos y feed
```

El objetivo **no** es cobertura de líneas, es **cobertura de flujos de usuario**: que ningún
PR pueda romper en silencio un camino que el usuario realmente recorre. La app no tiene
hoy ni un solo test automatizado (`package.json` sin devDependencies de testing), y ya
acumula 60+ PRs mergeados a mano, varios de ellos fixes de regresiones detectadas en
producción (PR #47 conteo de trofeos, PR #76 orden de queries paginadas, PR #87/#98/#106
avatares de PSN, PR #82 timeout del advisor). Ese patrón es exactamente lo que esta suite
tiene que cortar.

### 1.2 Qué está dentro del alcance

- Tests E2E con Playwright sobre Chromium (y un proyecto mobile para lo que cubrió el PR #101).
- Un usuario de test real en el proyecto Supabase actual, creado y destruido por la suite.
- Mocks deterministas de PSN, Groq, RAWG, SteamGridDB y Steam.
- CI en GitHub Actions en cada PR.
- Smoke tests contra el deploy de Vercel.

### 1.3 Qué queda explícitamente fuera

| Fuera de alcance | Por qué |
| --- | --- |
| Unit tests / integration tests de `lib/` | Otro esfuerzo, otro issue. Este PRD es solo E2E. |
| Tests de las policies de RLS a nivel SQL | Se validan indirectamente vía UI (usuario A no ve datos de usuario B). Una suite SQL dedicada merece su propio issue. |
| Firefox / WebKit | Nadie reportó bugs específicos de esos motores; se pueden agregar después cambiando un array en la config. |
| Visual regression / screenshots comparados | Costo de mantenimiento alto para una app en cambio constante. Reevaluar cuando el diseño se estabilice. |
| Tests del cron (`/api/cron/sync`) con schedule real | Se testea el endpoint con `CRON_SECRET`, no que Vercel lo dispare. |
| Performance / carga | Ya hay un diagnóstico manual documentado en `CLAUDE.md`. |

---

## 2. Restricciones que condicionan el diseño

Estas no son detalles de implementación: **cada una cambia lo que se puede testear**.

### R1 — Sony bloquea el NPSSO desde IPs de datacenter

Documentado en la memoria del proyecto y confirmado el 2026-08-16: `exchangeNpssoForAccessCode`
falla siempre en Vercel/AWS y funciona en local. **Consecuencia directa: los tests de PSN
en CI (GitHub Actions, que corre en Azure) NO pueden usar un NPSSO real.** El sync de PSN
se testea con mocks obligatoriamente; la verificación real es manual/local (`@live`).

### R2 — El NPSSO es un secreto de sesión y expira

No se commitea, no se loguea, no se pone en un `.env` versionado. Para la suite `@live`
el usuario lo pega en `.env.test.local` (gitignoreado) al momento de correrla.

### R3 — Groq free tier: 30 req/min, 14.4k req/día por organización

Un test que llame al advisor real en cada corrida de CI va a dar 429. El advisor se mockea
por defecto; el `@live` se corre a mano y de a uno.

### R4 — `games` y `trophies` son catálogo compartido, no datos por usuario

Las RLS permiten insert a cualquier `authenticated`, con `created_by = auth.uid()`. Un
usuario de test que inserte "The Witcher 3" deja esa fila en la base **para todos**. Por eso
todos los juegos que crea la suite llevan un prefijo reconocible y se borran con service
role en el teardown (ver §5.3).

### R5 — Supabase Auth puede exigir confirmación por email

`signup()` en `app/registro/actions.ts` hace `supabase.auth.signUp()` y devuelve sin
redirigir. Si el proyecto tiene "Confirm email" activo, el usuario no puede loguearse hasta
confirmar. **Los tests no leen mails.** El usuario de test se crea con service role
(`auth.admin.createUser({ email_confirm: true })`), que saltea la confirmación. El test del
formulario de registro verifica la UI del registro, no la confirmación por mail.

### R6 — Server Actions, no API routes

Casi todas las mutaciones son Server Actions (`useActionState`). No hay endpoints que
interceptar para la mayoría de los flujos: los mocks tienen que estar **del lado del
servidor** (variables de entorno que activan fixtures), no en `page.route()` del browser.
Esta es la decisión de arquitectura más importante de todo el PRD — ver §4.

### R7 — Los tests escriben en la base real del proyecto

Decisión tomada: no hay proyecto Supabase separado. Todo test **debe** poder limpiarse a sí
mismo, y ningún test puede asumir que la base está vacía o que un juego dado existe.

---

## 3. Estrategia de datos de test

### 3.1 Usuario de test

- Email: `e2e+<runId>@proyecto-platino.test`, donde `runId` es un timestamp+random por corrida.
  Un dominio `.test` (reservado por RFC 2606) garantiza que nunca sale un mail real.
- Se crea en `global-setup` con `supabase.auth.admin.createUser({ email_confirm: true })`.
- Se borra en `global-teardown` con `auth.admin.deleteUser(id)`; el `on delete cascade` de las
  migraciones se lleva `psn_accounts`, `user_games`, `user_trophies`, `guides`,
  `user_guide_progress`, `ai_game_plans`, `game_diary_entries` y `friendships`.
- Para los tests de aislamiento entre usuarios (§6.9) se crean **dos**: `userA` y `userB`.

### 3.2 Sesión: nunca loguearse por UI en cada test

Loguearse por formulario en cada spec es lento y frágil. Se usa el patrón de
**storageState**: `global-setup` hace un login real una sola vez, guarda las cookies en
`e2e/.auth/user.json`, y cada proyecto de Playwright arranca con esa sesión ya activa.
Los tests de login/registro/logout usan un contexto limpio (proyecto `anon`, sin storageState).

### 3.3 Fixtures de dominio

Las filas de catálogo que crea la suite se identifican con prefijo `[E2E]`:

- `games.title` → `[E2E] <nombre>`
- `games.np_comm_id` → `E2E-<runId>-<n>`

El teardown borra `from("games").delete().like("np_comm_id", "E2E-%")`. El prefijo es la red
de seguridad para las filas huérfanas de una corrida que se cortó a la mitad.

### 3.4 Prohibiciones

- ❌ Ningún test toca datos preexistentes de la cuenta real del usuario.
- ❌ Ningún test asume un `game_id` fijo hardcodeado.
- ❌ Ningún test depende del estado que dejó otro test (cada spec seedea lo suyo).
- ❌ Ningún test corre `delete` sin un filtro `E2E-%` o un `user_id` de test.

---

## 4. Estrategia de mocks (la decisión central)

Por R6, los mocks viven **en el servidor**. Se introduce un único interruptor:

```
E2E_MOCKS=1
```

Cuando está activa, los módulos de la capa de integración devuelven fixtures en vez de salir
a la red. La regla de aislamiento de `CLAUDE.md` juega a favor: **todas** las llamadas
externas ya están detrás de `lib/psn/`, `lib/ai/`, `lib/covers/` y `lib/external-guides/`,
así que hay exactamente cuatro puntos donde enchufar el mock.

### 4.1 Contrato del interruptor

| Módulo | Función real | Comportamiento con `E2E_MOCKS=1` |
| --- | --- | --- |
| `lib/psn/` | `getPsnIdentityFromNpsso` | NPSSO `E2E-VALID-NPSSO` → identidad fija; `E2E-EXPIRED-NPSSO` → `NpssoExpiredError`; cualquier otro → error genérico |
| `lib/psn/sync.ts` | `syncUserTrophies` | Escribe en Supabase 3 juegos `[E2E]` con ~12 trofeos, uno de ellos platinado al 100% |
| `lib/ai/client.ts` | `generateAiRecommendations` | Perfil, "seguir jugando" con los ids cortos que vinieron en el input y un juego nuevo fijo (`[E2E] Juego Recomendado`); `E2E_AI_FAIL=1` tira `AiSchemaValidationError` |
| `lib/ai/client.ts` | `generateAiGamePlan` | Devuelve un plan válido contra `aiGamePlanSchema`; con `E2E_AI_FAIL=1` (o un `gameName` que arranque con `[E2E-AI-FAIL]` -- ver nota) tira `AiSchemaValidationError` |
| `lib/covers/` | `findCoverUrl`, `searchCatalogGames` | Carátula local de `public/`; búsqueda devuelve 3 candidatos fijos + un caso de remaster para el dedup |
| `lib/external-guides/` | `populateExternalGuidesForGame` | Inserta 1 guía de Steam + los 3 links de búsqueda |
| `lib/steam/` | `steamFetch` (única salida a la Steam Web API) | Vanity `e2e-steam-user` → perfil público con 2 juegos (uno con 2 logros, uno sin ninguno); `e2e-steam-private` → perfil con los detalles del juego en privado; cualquier otro → perfil inexistente. Ver `lib/steam/mocks.ts` |

**Regla dura:** el interruptor se lee **solo** dentro de esos módulos (`lib/**`), nunca en
componentes, páginas ni Server Actions. Si un test necesita un comportamiento nuevo, se
agrega una variable de entorno al contrato de arriba y se documenta acá. Producción nunca
setea `E2E_MOCKS`, y el build de Vercel no la define.

**Nota sobre `E2E_AI_FAIL` (agregada al escribir AI-05):** es una variable de todo el
proceso, fijada una sola vez cuando arranca el `webServer` de Playwright (igual que
`E2E_MOCKS`) -- no se puede prender solo para un test sin reiniciar el servidor, y la suite
comparte una única instancia para todos los specs. Por eso `lib/ai/mocks.ts` agrega un
segundo gatillo evaluado en cada llamada: un `gameName` que arranca con el prefijo
`[E2E-AI-FAIL]` fuerza el mismo `AiSchemaValidationError` sin depender del entorno. El test
lo dispara actualizando el nombre del juego seedeado antes de generar el plan.

### 4.2 Suite `@live`

Los mismos flujos, con las integraciones reales, etiquetados `@live` en el título del test.
Excluidos del proyecto por defecto (`grepInvert: /@live/`), se corren a mano con
`npm run e2e:live`. Pueden fallar por causas externas (R1, R3) sin que eso signifique un
bug: **un `@live` en rojo se investiga, no bloquea el merge.**

---

## 5. Arquitectura de la suite

### 5.1 Estructura de carpetas

```
e2e/
  .auth/                     # storageState generado, gitignoreado
  fixtures/
    test.ts                  # `test` extendido: usuarios, seed helpers, service client
    psn.ts                   # payloads de PSN
    ai.ts                    # plan de IA válido / inválido
    catalog.ts               # resultados de RAWG
  helpers/
    supabase.ts              # createTestServiceClient(), seedGame(), cleanupByPrefix()
    auth.ts                  # createTestUser(), deleteTestUser(), loginViaUi()
    ids.ts                   # runId, prefijos [E2E]
  specs/
    01-auth.spec.ts
    02-psn-connect.spec.ts
    03-sync-library.spec.ts
    04-game-detail.spec.ts
    06-external-links.spec.ts
    07-ai-advisor.spec.ts
    08-diary.spec.ts
    09-friends.spec.ts
    10-profile.spec.ts
    11-a11y-mobile.spec.ts
    12-security-isolation.spec.ts
    13-steam.spec.ts
    16-recommendations.spec.ts
    smoke.spec.ts            # el único que corre contra Vercel
  global-setup.ts
  global-teardown.ts
playwright.config.ts
```

La numeración de los specs refleja el orden natural del flujo del issue #30 y hace que el
reporte se lea como el recorrido del usuario. **No implica orden de ejecución** — corren en
paralelo y cada uno es independiente (§3.4).

### 5.2 Proyectos de Playwright

| Proyecto | storageState | grep | Para qué |
| --- | --- | --- | --- |
| `setup` | — | `global-setup` | Crea usuarios, guarda sesión |
| `anon` | ninguno | `01-auth`, `12-security` | Login, registro, redirects de rutas protegidas |
| `authed` | `user.json` | todo lo demás | El grueso de la suite |
| `mobile` | `user.json` | `11-a11y-mobile` | Pixel 7: layout mobile, barra inferior y PWA |
| `smoke` | ninguno | `smoke.spec.ts` | Contra `PLAYWRIGHT_BASE_URL` de Vercel |

### 5.3 Ciclo de vida

```
global-setup    → crea userA/userB con service role, login, guarda storageState
  specs         → cada uno seedea lo suyo con prefijo [E2E]; corren en paralelo
global-teardown → borra usuarios y todo lo que matchee E2E-%
```

El teardown corre **siempre**, incluso con la suite en rojo. Si el proceso muere de golpe,
la próxima corrida limpia lo viejo en el setup (el filtro por prefijo lo permite).

---

## 6. Matriz de casos de prueba

Prioridades: **P0** rompe el producto (bloquea merge) · **P1** funcionalidad principal ·
**P2** borde y pulido.

### 6.1 Auth (`01-auth.spec.ts`) — proyecto `anon`

| ID | Caso | Pasos | Resultado esperado | Prio |
| --- | --- | --- | --- | --- |
| AUTH-01 | Rutas protegidas redirigen sin sesión | Visitar `/perfil`, `/juegos`, `/psn`, `/diario` | 307 a `/login` en las 4 | P0 |
| AUTH-02 | Rutas públicas cargan sin sesión | Visitar `/`, `/login`, `/registro` | 200, sin redirect | P0 |
| AUTH-03 | Login con credenciales válidas | Formulario con el usuario de test | Redirect a `/perfil`, nav autenticado visible | P0 |
| AUTH-04 | Login con password incorrecta | Password basura | Se muestra `FormError`, sigue en `/login` | P0 |
| AUTH-05 | Login con email inexistente | Email random | Mismo mensaje de error que AUTH-04 (no filtra si el email existe) | P1 |
| AUTH-06 | Registro con password < 8 caracteres | `pass123` | Error "La contraseña debe tener al menos 8 caracteres", sin llamada a Supabase | P1 |
| AUTH-07 | Registro con email ya existente | Email del usuario de test | Error "¿Ya existe ese email?" | P1 |
| AUTH-08 | Registro válido | Email nuevo `e2e+...` | Sin error en pantalla; el usuario se limpia en teardown | P1 |
| AUTH-09 | Logout | Desde `/perfil`, botón salir | Redirect a `/login`; volver a `/perfil` redirige de nuevo | P0 |
| AUTH-10 | Campos con `type` y `autocomplete` correctos | Inspeccionar inputs | `type=email` / `type=password`, `autocomplete` presente (issue #67) | P2 |

> ✅ **Resuelto (issue #126):** el `[DEBUG]` de `app/login/actions.ts` ya no existe. Login y
> registro devuelven siempre el mismo texto genérico y mandan el error crudo de Supabase a
> `console.error` (logs del server). AUTH-04 y AUTH-05 assertean el mismo string exacto,
> `"Email o contraseña incorrectos."`, justamente para que no se pueda enumerar cuentas.

### 6.2 Conexión PSN (`02-psn-connect.spec.ts`)

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| PSN-01 | `/psn` sin cuenta conectada | Instrucciones para obtener el NPSSO + link a `ca.account.sony.com` | P1 |
| PSN-02 | NPSSO vacío | "Pegá tu NPSSO.", sin request al servidor de PSN | P1 |
| PSN-03 | NPSSO válido (mock) | Mensaje "Cuenta PSN conectada: `<onlineId>`"; `psn_accounts` con `token_status='valid'` | P0 |
| PSN-04 | NPSSO vencido (mock) | Mensaje específico de expiración, distinto del genérico (issue #24/#68) | P0 |
| PSN-05 | NPSSO inválido (mock) | Mensaje genérico "No se pudo validar el NPSSO…" | P1 |
| PSN-06 | El NPSSO no aparece en el cliente | Ni en el HTML, ni en localStorage, ni en ninguna respuesta de red | **P0 (seguridad)** |
| PSN-07 | Avatar de PSN se renderiza | `<img>` con host permitido en `next.config.ts`, sin error de red (PR #87/#98/#106) | P1 |
| PSN-08 | Avatar roto cae al placeholder | Forzar 404 en la URL del avatar | Placeholder visible, sin ícono roto (PR #106) | P2 |
| PSN-09 | Reconexión con `token_status='expired'` | Banner de "reconectar" en `/psn` y `/perfil` | P1 |
| PSN-10 | `@live`: NPSSO real | Conexión exitosa corriendo en local | P2 |
| PSN-11 | NPSSO no legible con la sesión (#130) | Con la anon key y la sesión del dueño se leen `online_id`/`token_status`/`last_synced_at`, pero un select de `npsso_encrypted` da error de permisos. Conectar y sincronizar siguen andando (van por service role) | **P0 (seguridad)** |

### 6.3 Sync y biblioteca (`03-sync-library.spec.ts`)

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| SYNC-01 | Sync manual desde `/psn` | Los 3 juegos `[E2E]` aparecen en `/juegos` con carátula y % | P0 |
| SYNC-02 | Sync desde la biblioteca | El `SyncButton` de `/juegos` dispara el mismo flujo (PR #103) | P1 |
| SYNC-03 | Sync con NPSSO vencido | Error visible + `token_status` pasa a `expired` | P0 |
| SYNC-04 | Sync idempotente | Correrlo dos veces no duplica juegos ni trofeos | P0 |
| SYNC-05 | Biblioteca vacía | `EmptyState` con CTA a conectar PSN | P1 |
| SYNC-06 | Conteo por tipo correcto | Bronce/plata/oro/platino coinciden con el fixture (regresión del PR #47) | P0 |
| SYNC-07 | Badge de platino | Solo en el juego 100% del fixture (issue #72) | P1 |
| SYNC-08 | Filtros de biblioteca | "Platinados" y ">50%" filtran bien (issue #73) | P1 |
| LIB-01 | Buscador de la biblioteca | Tipear un nombre deja sólo los juegos que coinciden; limpiar restaura la grilla | P1 |
| LIB-02 | La búsqueda vive en la URL | Queda en `?q=` y sobrevive al reload | P2 |
| LIB-03 | Búsqueda sin resultados | El estado vacío nombra el término buscado | P2 |
| LIB-04 | Matcher de búsqueda | `matchesSearch` ignora acentos/símbolos y acepta las palabras en cualquier orden (test puro) | P1 |
| LIB-10 | Secciones de `/biblioteca` (`28-library-home.spec.ts`) | Recomendados → Cerca del platino → Tu biblioteca, con Jugando ahora antes si hay algo; `?q=` y `?fuente=` siguen filtrando la grilla | P1 |
| LIB-11 | Recomendaciones en la Biblioteca | "Recomendados para vos" se ve en `/biblioteca` (mock de Groq) y ya no en `/perfil/diario` | P1 |
| LIB-12 | Cerca del platino | Un juego a más del 80% sin platino aparece; uno platinado al 91% y uno al 50% no; `selectNearPlatinum` ordena por % y en Steam cierra al 100% (test puro) | P1 |
| LIB-13 | Seguí jugando | Un juego a más del 80% recomendado para seguir no se repite en "Seguí jugando" (ya está en Cerca del platino); la ✕ saca un juego, escribe `user_games.keep_playing_dismissed_at` y no vuelve al recargar, salvo que el sync traiga un `last_played_at` posterior | P1 |
| SYNC-09 | Orden por última jugada | Sin recarga de página (PR #49) | P2 |
| SYNC-10 | Juegos `source='catalog'` no aparecen | Un juego de catálogo del diario no se lista en `/juegos` | P1 |
| SYNC-11 | `/api/cron/sync` sin `CRON_SECRET` | 401 | **P0 (seguridad)** |
| SYNC-12 | `/api/cron/sync` con bearer correcto | 200 con resumen por plataforma, sin `userId` en la respuesta | P1 |
| SYNC-13 | Horas jugadas de PSN | `playtime_minutes` guardado desde `playDuration`, visible en la tarjeta de la biblioteca y en el hero de la ficha; un juego sin horas reportadas no muestra nada | P1 |
| SYNC-14 | Paginación de horas de PSN | `decideNextPage` no corta en la primera página cuando falta `totalItemCount` y recorre una biblioteca grande en páginas chicas | P1 |
| SYNC-15 | Fallo parcial de horas de PSN | Si una página de la lista de juegos jugados falla, `fetchPsnPlaytime` devuelve las páginas ya obtenidas en vez de perder el mapa entero | P1 |
| SYNC-16 | RLS de `user_games` | El usuario puede actualizar su propia fila: el segundo upsert del sync (ON CONFLICT DO UPDATE) no lo rechaza la RLS | P0 |
| SYNC-17 | Cruce de nombres de PSN | `playtimeMatchKey` ignora el sufijo del set de trofeos ("… Trophies") y el de plataforma, sin colapsar juegos distintos | P1 |
| SYNC-18 | Freno del sync manual (#128) | Un segundo sync antes de 10 minutos: el botón queda deshabilitado con cuánto falta (también tras recargar) y `POST /api/psn/sync` responde 429 con `Retry-After`. El cron no pasa por esa ruta y no queda sujeto al límite | **P0 (seguridad)** |
| SYNC-19 | Cálculo del freno | `cooldownRemainingMs` devuelve 0 sin fecha, con fecha inválida o pasada la ventana, y lo que falta dentro de ella; `formatCooldown` nunca dice "0 minutos" | P1 |
| SYNC-20 | Chequeo del `CRON_SECRET` (test puro) | `isValidCronAuthorization` compara en tiempo constante; rechaza mismo largo con otro contenido, sin prefijo `Bearer`, header nulo y secreto vacío | **P0 (seguridad)** |
| SYNC-21 | Bearer incorrecto del mismo largo | 401 en el cron completo, `?paso=listas` y `?paso=estudios` | **P0 (seguridad)** |

### 6.4 Detalle de juego (`04-game-detail.spec.ts`)

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| GAME-01 | Lista de trofeos completa | Todos los del fixture, agrupados y en orden (PR #76) | P0 |
| GAME-02 | Trofeos no obtenidos en b/n | Filtro grayscale presente; los obtenidos en color (PR #102) | P1 |
| GAME-03 | Barra de progreso | % coincide con obtenidos/total | P1 |
| GAME-04 | Rareza y DLC | Se muestran cuando el fixture los trae (PR #87) | P2 |
| GAME-05 | ~~Breadcrumb~~ | Reemplazado por FICHA-02/03 (issue #186): con la ficha unificada no hay subpantallas de enlaces/diario de las que volver, y el breadcrumb se eliminó | — |
| GAME-06 | `id` inexistente | Estado de error/404 controlado, no un stack trace | P1 |
| GAME-07 | Juego de otro usuario | No se filtran trofeos ajenos (RLS) | **P0 (seguridad)** |
| GAME-08 | Caché de datos de catálogo | La ficha guarda fondo/descripción aunque el juego lo haya creado otro usuario | P1 |

### 6.5 ~~Guías propias~~ (eliminado)

La pantalla `/juegos/[id]/guias` y su spec (`05-guides.spec.ts`) se eliminaron: el checklist
de guías propias no se usaba y la ficha del juego ya resuelve el mismo problema con el advisor
de IA y los enlaces externos. Las tablas `guides`/`guide_steps`/`user_guide_progress` siguen
existiendo en la base (los enlaces cargados a mano se muestran en Enlaces externos), pero no
hay UI que las edite, así que no hay casos que testear. Los IDs GUIDE-01 a GUIDE-09 quedan
retirados y no se reutilizan.

### 6.6 Enlaces externos (`06-external-links.spec.ts`)

Desde la ficha unificada (issue #186) viven en la tab Guías e IA (`/juegos/[id]/guias`);
`/juegos/[id]/enlaces` redirige.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| LINK-01 | Buscar guías externas (mock) | Aparecen guía de Steam + 3 links de búsqueda, con atribución de fuente | P1 |
| LINK-02 | Sin resultados | `EmptyState`, no un error | P2 |
| LINK-03 | Falta `SUPABASE_SERVICE_ROLE_KEY` | Error mostrado en la UI, **no** un 500 "This page couldn't load" (regresión documentada en `CLAUDE.md`) | P0 |
| LINK-04 | No se duplican | Buscar dos veces no duplica filas (upsert `game_id,url`) | P1 |
| LINK-05 | Links con `target=_blank` + `rel=noopener` | Atributos presentes | P2 |
| LINK-06 | Relevancia de las guías de Steam | Las traducciones, mods y fixes de performance se descartan; las guías de logros/100%/walkthrough/builds quedan y se ordenan primero | P1 |
| LINK-07 | Idioma de las guías de Steam | Solo quedan títulos en español o en inglés; los de escritura no latina (ruso, chino, coreano) y los de otros idiomas latinos (portugués, italiano, alemán, polaco…) se descartan aunque estén etiquetados | P1 |
| LINK-08 | La búsqueda no confía en el form (#127) | El nombre del juego sale de `games`, no de un input; un `gameId` inexistente devuelve "No se encontró el juego." y no escribe nada | P0 |

### 6.7 Advisor con IA (`07-ai-advisor.spec.ts`)

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| AI-01 | Generar plan (mock) | Se renderizan resumen, missables, orden sugerido y tips | P1 |
| AI-02 | Label de contenido generado por IA | Visible **siempre**, incluso sin plan generado | P0 |
| AI-03 | Plan cacheado | Al recargar sale el último plan `ok` sin volver a llamar al proveedor | P1 |
| AI-04 | Regenerar | Inserta una fila nueva en `ai_game_plans`, no pisa la anterior | P1 |
| AI-05 | Error de schema (`E2E_AI_FAIL=1`) | Mensaje "no se pudo generar", sin plan roto ni 500 | P0 |
| AI-06 | Error del proveedor | Mensaje distinguible del de schema (PR #55) | P1 |
| AI-07 | Estado de carga | Botón deshabilitado + spinner mientras genera | P2 |
| AI-08 | `@live`: Groq real | Plan válido contra el schema de Zod | P2 |
| AI-10 | Clic en un trofeo del plan | Es un link a la tab Trofeos con `?trofeo=<id>` (#186): lleva al trofeo y le abre la ayuda de "cómo desbloquearlo" ya cargada | P1 |
| AI-11 | Siguiente trofeo | La tarjeta "Siguiente trofeo" muestra un trofeo pendiente con los pasos para desbloquearlo, y clickearlo lleva al trofeo en la tab Trofeos | P1 |
| AI-12 | Trofeos de acumulación | El plan lista los trofeos que piden juntar una cantidad, con su objetivo, su categoría y el aviso cuando no se pueden farmear después | P1 |
| AI-13 | Tamaño del prompt del plan | El prompt de un juego de 53/80/120 trofeos entra en el presupuesto de tokens del free tier, y los trofeos ya obtenidos no se mandan | P0 |
| AI-14 | Trofeos de historia no son perdibles | El system prompt del plan le prohíbe explícitamente al modelo poner en "missables" los trofeos que se desbloquean solos avanzando la historia, y exige un punto de no retorno concreto para cada missable | P1 |
| AI-15 | Freno del plan de IA (#128) | Regenerar antes de 5 minutos muestra cuánto falta, no llama al proveedor ni inserta una fila, y el plan anterior sigue visible | P1 |
| AI-16 | Perdibles primero | Si queda algún perdible pendiente, la tarjeta "Siguiente trofeo" es el primero de la run (el primero de `missables`, marcado "Perdible" con su límite) aunque el modelo haya sugerido otro; la sección de perdibles va justo debajo, numerada en orden de la partida, y se muestra también cuando no hay ninguno. El prompt pide los perdibles completos y en orden cronológico | P1 |
| AI-09 | Trofeos de dificultad | La sección "Trofeos de dificultad" lista el trofeo con su categoría (dificultad máxima, contrarreloj, etc.) | P1 |

### 6.8 Diario / Letterbox (`08-diary.spec.ts`)

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| DIARY-01 | Marcar juego como terminado | Entrada creada con rating y reseña | P0 |
| DIARY-02 | Buscador de catálogo con debounce | No busca con < 3 caracteres (`MIN_QUERY_LENGTH`) | P1 |
| DIARY-03 | Resultados se ocultan bajo el mínimo | Al borrar caracteres desaparecen los resultados viejos | P1 |
| DIARY-04 | Alta de juego de catálogo | `games.source='catalog'`, vinculado en `user_games` | P1 |
| DIARY-05 | Confirmación de remaster | El dedup pregunta "¿es el mismo juego?" ante un candidato similar (issue #90) | P2 |
| DIARY-06 | `finished_on` sin desfase de día | La fecha elegida es la que se guarda y se muestra (riesgo de UTC documentado) | P0 |
| DIARY-07 | Rejugada | Segunda entrada del mismo juego con `playthrough_number = 2` | P1 |
| DIARY-08 | Editar / borrar entrada | Persiste tras recargar | P1 |
| DIARY-09 | Timeline agrupado por mes | Encabezados de mes/año correctos | P1 |
| DIARY-10 | Filtros del timeline | Año, plataforma y rating filtran client-side, sin request | P1 |
| DIARY-11 | Score comunitario con < 3 votos | "todavía sin suficientes valoraciones" (issue #92) | P0 |
| DIARY-12 | Score comunitario con ≥ 3 votos | Muestra el promedio | P1 |
| DIARY-13 | Badge de platino en el diario propio | Aparece solo si los trofeos sincronizados lo justifican | P2 |
| DIARY-14 | Diario público | userB ve el diario de userA | P1 |
| DIARY-15 | userB no puede editar el diario de userA | Sin controles; la Server Action rechaza | **P0 (seguridad)** |
| DIARY-20 | Diario con el formato de Letterboxd (`33-profile-tabs.spec.ts`, #197) | Agrupado por mes con cabecera `sticky`, el día en su recuadro, más nuevo primero; la fila abre la ficha con la entrada enfocada | P1 |
| DIARY-21 | Filtros del diario (`33-profile-tabs.spec.ts`, #197) | Año y rating (incluido "Sin rating") acotan las filas y quedan en la URL | P1 |

> Desde la ficha unificada (issue #186) el diario de un juego es la tab Reseñas de
> `/juegos/[id]` y "Marcar como terminado" se abre desde "Registrar o puntuar" en el panel de
> acciones; `/juegos/[id]/diario` redirige. Registrar una partida vincula el juego a
> `user_games` si no lo estaba.

### 6.9 Amigos (`09-friends.spec.ts`)

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| FRIEND-01 | Buscar usuarios sin query | Lista usuarios; userB aparece | P1 |
| FRIEND-02 | Buscar por `online_id` de PSN | userB filtrado correctamente | P1 |
| FRIEND-03 | Agregar amigo | Aparece en la lista; el feed muestra su diario | P0 |
| FRIEND-04 | Re-agregar al mismo amigo | Upsert, sin error 23505 | P1 |
| FRIEND-05 | Eliminar amigo | Sale de la lista y del feed | P1 |
| FRIEND-06 | Usuario sin PSN | Se muestra "Usuario sin nombre", no un hueco vacío | P2 |
| FRIEND-07 | Sin badge de platino en el feed ajeno | Nunca aparece (`user_trophies` es privado) | **P0 (seguridad)** |
| FRIEND-08 | `public_profiles` no filtra secretos | Ni `npsso_encrypted`, ni `account_id`, ni email en ninguna respuesta | **P0 (seguridad)** |
| REV-01 | Feed de Biblioteca › Reseñas (`28-library-home.spec.ts`) | Sólo reseñas **con texto** de gente que seguís, de la más nueva a la más vieja; las de sólo rating y las de no-amigos no aparecen; el nombre del juego en la serif (estilo computado) | P0 |
| REV-02 | "Leer más" | Sólo en una reseña cortada; abre `/juegos/[id]?resena=<id>` con esa fila marcada (`aria-current`), entera y en pantalla | P1 |
| REV-03 | "Cargar más" | Con 25 reseñas, la primera página trae 20 y "Cargar más" suma las 5 restantes debajo, sin repetidas, con el foco en la primera nueva y sin botón al final; el cursor rechaza basura (test puro) | P1 |

### 6.10 Perfil (`10-profile.spec.ts`, `19-profile.spec.ts`, `32-profile-v2.spec.ts`, `33-profile-tabs.spec.ts`)

PROF-06..PROF-10 son del rediseño del perfil: el Top 5 elegido por el usuario (que reemplazó a
"Jugados recientemente") y el perfil público de otro usuario. No hay nada mockeado: el Top 5 y
el diario son datos propios de la app (`user_favorite_games`, `game_diary_entries`), no salen de
ninguna API externa.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| PROF-01 | Stats globales | Juegos en biblioteca, trofeos por tipo y % coinciden con el fixture | P0 |
| PROF-02 | Nivel de trofeos de PSN | Se muestra el que trajo la conexión (PR #103) | P1 |
| PROF-03 | Juegos de catálogo no cuentan | "Juegos en biblioteca" los excluye | P1 |
| PROF-04 | Perfil sin PSN conectada | CTA a conectar, sin números en cero confusos | P1 |
| PROF-05 | Coherencia con `/juegos` | Los totales del perfil coinciden con los de la biblioteca (mismo RPC) | P1 |
| PROF-06 | Sin "Últimos jugados" | La sección de jugados recientemente ya no está; en su lugar está el Top 5 | P1 |
| PROF-07 | Elegir el Top 5 | Guardar deja las filas de `user_favorite_games` con su `slot` y las carátulas se ven numeradas en el perfil | P0 |
| PROF-08 | Últimas reseñas propias | El perfil muestra las últimas entradas del diario con su puntuación y el arranque de la reseña | P1 |
| PROF-09 | Perfil de otro usuario | `/perfil/[id]` muestra su Top 5 y sus reseñas, ofrece agregarlo a amigos y **no** deja editar su Top 5 | P0 |
| PROF-10 | Perfil propio por id | `/perfil/<mi id>` redirige a `/perfil` (la pantalla propia, con el editor) | P2 |
| PROF-11 | Foco del buscador del Top 5 | Tipear en el campo no devuelve el foco a la ✕ del modal (en mobile cerraba el teclado tecla por medio) | P1 |
| PROF-12 | Top 5 más allá de la biblioteca | Un juego que el usuario no tiene sincronizado se busca en el catálogo, se vincula en `user_games` y entra al Top 5 | P1 |
| PROF-13 | Orden de Perfil › Perfil (#196) | Favoritos, Últimas reseñas, Tus puntuaciones y Estadísticas, en ese orden; el desglose de trofeos de PSN ya no está en la pantalla principal | P1 |
| PROF-14 | Histograma con rejugadas | Cuenta el último rating **puntuado** de cada juego, igual que `game_scores` (test puro sobre `lib/profile/stats.ts`) | P0 |
| PROF-15 | Barra del histograma | Tocar una barra lleva a `/perfil/resenas?rating=N` y muestra sólo los juegos cuyo último rating cae ahí | P1 |
| PROF-16 | Juegos jugados sin duplicar | Un juego platinado y reseñado aparece una sola vez en `/perfil/jugados` | P0 |
| PROF-17 | Filas de Estadísticas | Cada fila lleva a su expandido con su título | P1 |
| PROF-18 | "Este año" y la zona horaria | Una `date` se corta como string; un instante se resuelve en la zona de la app (un platino del 31/12 a la noche en Argentina es de ese año) — test puro | P1 |
| PROF-19 | Platinos y 100% separados | Un 100% de Steam está en `/perfil/completados` y no en `/perfil/platinos`; la fila "100% en Steam" es aparte | P1 |
| PROF-20 | Bio | Se edita en Configuración › Perfil y se ve debajo del avatar | P1 |
| PROF-21 | Perfil ajeno (`33-profile-tabs.spec.ts`, #197) | Las cuatro tabs (Perfil · Diario · Listas · Playlist), sin engranaje ni editores, con Seguir / Siguiendo; las estadísticas aclaran que son públicas y no traen 100%, likes ni seguidores | **P0 (privacidad)** |
| PROF-22 | Listas en el perfil (`33-profile-tabs.spec.ts`, #197) | Una lista privada no aparece en el perfil ajeno; en el propio aparece con candado | **P0 (privacidad)** |

### 6.11 Accesibilidad, mobile y PWA (`11-a11y-mobile.spec.ts`) — proyecto `mobile`

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| A11Y-01 | Sin scroll horizontal | 375px de ancho en `/`, `/juegos`, `/juegos/[id]`, `/diario`, `/perfil` (PR #101) | P1 |
| A11Y-02 | Foco visible por teclado | Tabular por login y por la biblioteca muestra el anillo de foco (issue #69) | P1 |
| A11Y-03 | Navegación por teclado en modales | Escape cierra; el foco queda atrapado dentro (`components/Modal.tsx`) | P1 |
| A11Y-04 | Imágenes con `alt` | Carátulas e íconos de trofeo con texto alternativo | P2 |
| A11Y-05 | Jerarquía de headings | Un solo `h1` por página | P2 |
| A11Y-06 | Contraste WCAG AA | `@axe-core/playwright` sin violaciones serias en las 5 rutas principales | P1 |
| MOB-01 | Barra inferior de navegación | En mobile la barra de tabs navega entre secciones (Biblioteca → Actividad → Perfil) y marca la activa con `aria-current` | P1 |
| MOB-02 | La barra no tapa contenido | El spacer del layout reserva al menos el alto de la barra `fixed` | P1 |
| MOB-03 | Una sola nav visible | La nav del header queda oculta en mobile; la visible es la de abajo | P2 |
| MOB-04 | Biblioteca en grilla de carátulas | Cada juego es un póster con su barra de progreso y link a la ficha | P1 |
| MOB-05 | Filtros plegados en mobile | En la biblioteca el buscador se ve siempre y el orden/los filtros viven detrás de "Filtros", con el globito de cuántos hay puestos | P2 |
| MOB-06 | Una sola acción de cerrar sesión | En mobile el header no la repite: vive al final del perfil | P2 |
| MOB-07 | Top 5 en una sola fila | La grilla de favoritos declara cinco columnas en mobile | P2 |
| PWA-01 | Manifest instalable | `display: standalone`, `start_url` en `/biblioteca`, íconos 192/512 y uno `maskable` | P1 |
| PWA-02 | Service worker sin caché larga | `/sw.js` responde con `max-age=0` (si no, un SW nuevo no llega a los celulares) | P1 |
| PWA-03 | Build id en vivo | `/api/version` devuelve el build id con `no-store`: es lo que dispara el aviso de actualizar | P1 |
| PWA-04 | Pantalla de offline pública | `/offline` carga sin sesión (el SW la precachea antes de que haya usuario) | P2 |
| PWA-05 | Alta de la app | Configuración › Conexiones ofrece instalar Platinoob en el celular | P2 |

### 6.12 Aislamiento y seguridad (`12-security-isolation.spec.ts`)

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| SEC-01 | Trofeos privados | userB no ve `user_trophies` de userA por ninguna vía | P0 |
| SEC-02 | Secretos nunca en el cliente | Ninguna respuesta contiene `npsso`, `service_role`, `AI_PROVIDER_API_KEY` ni `CRON_SECRET` | P0 |
| SEC-03 | Server Actions validan autoría | Editar guía / entrada de diario ajena falla del lado del servidor, no solo por UI oculta | P0 |
| SEC-04 | Sin sesión, las Server Actions rechazan | Invocarlas con las cookies borradas devuelve error de auth | P0 |
| SEC-05 | Consola limpia | Ningún `console.error` en el recorrido feliz completo | P1 |
| SEC-06 | La anon key no lee tablas (#129) | Sin sesión, un select con la anon key sobre games, trophies, diario, likes, listas, estudios, etc. no devuelve filas: las policies de select van `to authenticated` | **P0 (seguridad)** |

### 6.13 Smoke en Vercel (`smoke.spec.ts`)

Sin usuario de test, sin escrituras, sin mocks. Corre contra `PLAYWRIGHT_BASE_URL`.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| SMOKE-01 | Landing carga | 200, título correcto | P0 |
| SMOKE-02 | `/login` y `/registro` cargan | 200, formularios presentes | P0 |
| SMOKE-03 | Rutas protegidas redirigen | `/perfil`, `/juegos`, `/psn`, `/configuracion/conexiones`, `/diario` → `/login` | P0 |
| SMOKE-04 | Metadata del sitio | `title`, `description` y favicon reales (issue #58) | P1 |
| SMOKE-05 | Sin errores de consola en la landing | Consola limpia | P1 |

### 6.14 Steam y Conexiones (`13-steam.spec.ts`)

Fase 13 (issues #110-#119). Toda la Steam Web API va mockeada (§4.1): la key es de la app
y en CI no hay ninguna, así que ninguna de estas pruebas sale a la red. Los juegos que
crea el sync se borran por su rango reservado de appid (`E2E_STEAM_APPID_MIN`).

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| STEAM-01 | `/psn` sigue funcionando | Redirige a `/configuracion/conexiones` | P0 |
| STEAM-02 | Conexiones lista las plataformas | Una tarjeta para PSN y otra para Steam | P0 |
| STEAM-03 | SteamID inexistente | Mensaje propio ("No encontramos ese perfil"), no un error genérico | P0 |
| STEAM-04 | Conectar por vanity URL | Fila en `steam_accounts` con `verified = false`, y la UI lo aclara | P0 |
| STEAM-05 | Sync de logros | 2 juegos `source = 'steam'`, logros con `type = 'achievement'`, el juego sin logros marcado con `steam_has_achievements = false`, 1 logro en `user_trophies`, `playtime_minutes` guardado y visible como horas en la tarjeta, el ícono normalizado al host que acepta `next/image`, y la biblioteca esconde el juego con 0 horas y 0 logros | P0 |
| STEAM-06 | Perfil en privado | La cuenta se guarda igual con `profile_visibility = 'private'` y la tarjeta explica cómo cambiarlo | P0 |
| STEAM-07 | Desconectar | La fila de `steam_accounts` desaparece; los juegos sincronizados se mantienen | P1 |
| STEAM-08 | Diario al 100% | Un juego de Steam con todos sus logros crea una entrada `source = 'completion_sync'` con `completed_at` y **sin** tocar `platinum_earned_at`; la fecha es la del último logro | P0 |
| STEAM-09 | OpenID falsificado | Una respuesta de OpenID sin firma válida NO marca la cuenta como verificada | P0 |
| STEAM-10 | OpenID válido | Una respuesta válida deja `verified = true` y la tarjeta lo muestra | P0 |
| STEAM-11 | Filtro de fuente | El selector solo aparece con las dos cuentas conectadas, y un `?fuente=` inválido cae a "Todos" | P1 |

### 6.15 Recomendaciones de IA (`16-recommendations.spec.ts`)

La sección "Recomendados para vos" de `/biblioteca` (antes en el diario, issue #191): la IA infiere el gusto del usuario desde
sus platinos/100% y devuelve qué seguir jugando de su propia biblioteca y qué probar de
nuevo. Mismo mock que el advisor (`lib/ai/mocks.ts`, `E2E_MOCKS=1`): las corridas de CI
nunca llaman a Groq.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| REC-01 | Label de contenido generado por IA | Visible **siempre**, incluso sin recomendaciones generadas | P0 |
| REC-02 | Generar (mock) | Se guarda una fila `ok` en `ai_recommendations` y salen el perfil, "Seguí jugando" con la carátula del juego en curso y "Para probar" | P0 |
| REC-03 | Cacheadas | Al recargar siguen las últimas `ok` sin volver a llamar al proveedor | P1 |
| REC-04 | Regenerar | Inserta una fila nueva, no pisa la anterior | P1 |
| REC-05 | Id de juego inventado | Una recomendación que apunta a un juego inexistente se descarta, no rompe la grilla | P1 |
| REC-06 | Biblioteca vacía | Mensaje propio pidiendo sincronizar, sin llamar al proveedor | P2 |
| REC-07 | `@live`: Groq real | Respuesta válida contra `aiRecommendationsSchema` | P2 |

### 6.16 Importación masiva de capturas (`17-screenshot-import.spec.ts`)

Sony **no expone la galería de capturas de PSN** por ninguna API usable (ver `CLAUDE.md`), así
que las capturas siguen saliendo del archivo del usuario. Lo que reemplaza al import automático
es `/diario/capturas`: se suelta la carpeta exportada de la consola y cada archivo se asigna al
juego que dice su ruta. SHOT-01..SHOT-05 son tests de la función pura
(`lib/diary/screenshot-import.ts`, sin `server-only` justamente para poder importarla desde el
spec, igual que `steam-relevance`); SHOT-06 es de UI y no sube nada a Storage.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| SHOT-01 | Nombre desde la carpeta de la consola | `PS4/SHARE/Screenshots/<Juego>/...` y `PS5/CREATE/Screenshots/<Juego>/...` devuelven el título; las carpetas estructurales se saltean | P0 |
| SHOT-02 | Nombre desde el archivo | Se recortan los sufijos de fecha/hora (`_20230115121314`, `_20230115_121314`, `-2023-01-15-12-13-14`) y el contador `(1)` | P0 |
| SHOT-03 | Números que son parte del título | "Battlefield 2042" y "Forza Horizon 5" no se recortan; un nombre puramente numérico devuelve `null` | P0 |
| SHOT-04 | Match contra la biblioteca | Tolera ediciones ("Remastered") y no confunde "God of War" con "God of War Ragnarök" | P0 |
| SHOT-05 | Agrupación | Archivos del mismo juego caen en un grupo (venga de carpeta o de nombre) y lo no deducido queda aparte | P1 |
| SHOT-06 | Pantalla de importación | Elegidos los archivos, se ve el grupo con el juego preseleccionado y el botón con la cantidad a importar | P1 |
| SHOT-07 | Grupo sin juego | Con "— No importar —" esas capturas no se suben | P2 |

### 6.17 Tiempos estimados de juego (`18-time-to-beat.spec.ts`)

Cuánto lleva pasarse la historia y cuánto llegar al 100%, en la ficha de trofeos y en la de
diario. HowLongToBeat no tiene API pública, así que la fuente es IGDB (`game_time_to_beat`), y
es la única: el `playtime` de RAWG se probó como fallback y se revirtió por dar números
equivocados — ver la sección correspondiente de `CLAUDE.md`.
TIME-01..03 son de la función pura (`lib/time-to-beat/match.ts`); TIME-04/05 corren contra el
mock de `lib/time-to-beat/mocks.ts` (12 h / 30 h para los juegos `[E2E]`), así que CI nunca
llama a IGDB.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| TIME-01 | Elección del juego en IGDB | Matchea el título exacto; un DLC u otra entrega de la saga no lo reemplazan, y sin match devuelve `null` | P0 |
| TIME-02 | Ediciones | "Remastered"/"Director's Cut" matchean contra el juego base (`normalizeName`) | P1 |
| TIME-03 | Unidades y valores vacíos | Los segundos pasan a minutos; 0 y negativos devuelven `null` en vez de "0 h" | P0 |
| TIME-04 | Ficha de trofeos | Se ven "Pasarlo" y "Platino" con sus horas, y la fuente citada; en un juego sin platino la segunda dice "Al 100%" | P0 |
| TIME-05 | Caché compartido entre tabs | Los tiempos quedan guardados en `games` y la tab Guías e IA de la ficha muestra los mismos | P1 |
| TIME-06 | `@live`: IGDB real | Un juego conocido devuelve `status: "ok"` con los dos tiempos mayores a cero | P2 |
| TIME-07 | No se pudo consultar IGDB | El juego **no** queda marcado como consultado, para que se reintente cuando el problema se arregle | P0 |
| TIME-08 | Nombres del catálogo contra IGDB | "Skyrim", "…- Multiplayer" y los que traen ®/™ matchean contra el título real; una entrega distinta de la saga no | P0 |
| TIME-09 | Criterio HowLongToBeat sobre la fila de IGDB | La historia sale de `hastily` (Main Story, cae a `normally` si falta), el 100% nunca es menor que la historia y con menos de 3 partidas (`count`) no se usa el dato | P0 |

### 6.18 Sistema de diseño (`21-design-system.spec.ts`)

Fases 1 a 5 del remake visual (issue #176) y la paleta refinada del epic #183 (issue #184, DS-21..DS-24). Lo que se verifica no es "cómo se ve" sino que las
piezas del sistema **se apliquen de verdad**: los dos bugs que motivaron la fase eran de ese
tipo y ninguno se veía leyendo el diff (la fuente cargada no la usaba nadie porque `body` la
pisaba con Arial; los tokens de `globals.css` estaban definidos y con 0 usos). Un test que
mira el estilo computado los agarra; uno que mira clases de Tailwind, no.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| DS-01 | La app no cae a la fuente del navegador | El `font-family` computado de `body` resuelve a Geist y no empieza en Arial | P1 |
| DS-02 | Tokens definidos y con valor | Los 21 tokens del sistema resuelven a un valor no vacío; las dos familias, a Geist y Newsreader y no a su genérica de fallback | P1 |
| DS-03 | La escala tipográfica compila y jerarquiza | `type-stat` mide más de 1.5× que `type-overline`, el overline va en versalitas espaciadas y el número en `tabular-nums` | P1 |
| DS-04 | Los íconos reemplazan a los emojis | El "estimado por IA" de la ficha muestra `[data-icon="sparkle"]` y no contiene ✨ | P2 |
| DS-05 | Íconos decorativos fuera del árbol de a11y | El ícono que acompaña a un texto que ya lo dice va con `aria-hidden="true"` | P2 |
| DS-06 | Las primitivas pintan con los tokens | El `background-color` computado del botón primario es exactamente el valor de `--accent`, no un `blue-*` parecido | P1 |
| DS-07 | El badge de platino del póster es un ícono | La tarjeta de un juego platinado muestra `[data-icon="trophy"]`, no contiene 🏆, y el ícono se anuncia como imagen "Platino" | P2 |
| DS-08 | El nombre del juego va en la serif editorial | El `font-family` computado del título de la ficha resuelve a Newsreader mientras el resto de la app sigue en Geist | P1 |
| DS-09 | Las secciones de la ficha son tabs, sin emojis | El `tablist` "Ficha del juego" tiene las tabs Reseñas / Trofeos / Guías e IA (ficha unificada, #186) y no contiene 🏆 ✨ 🔗 📔 | P2 |
| DS-10 | La lista de trofeos son filas con hairline | Una fila de trofeo no tiene fondo propio ni radio, y separa con un borde inferior de 1px | P2 |
| DS-11 | La rareza pinta con los tokens de rareza | El `color` computado del chip "Ultra rara" es exactamente `--rarity-ultra`, no un fucsia parecido | P2 |
| DS-12 | La reseña del diario va en la serif de lectura | El `font-family` computado del texto de una reseña resuelve a Newsreader | P1 |
| DS-13 | El rating son íconos del set, no los glifos ★/☆ | Un rating 9/10 muestra 10 `[data-icon="star"]` y no contiene ★ ni ☆ | P2 |
| DS-14 | Las acciones de `/diario` usan íconos, no emojis | La fila de acciones muestra `[data-icon]` (chart/camera/trophy/check) y no contiene 📊 📷 🏆 ✓ | P2 |
| DS-15 | El nombre del juego en la ficha va en la serif | El `font-family` computado del `h1` de `GameHero` (el hero único de la ficha, #186) resuelve a Newsreader | P1 |
| DS-16 | El tab activo del header se marca con acento, peso y `aria-current` | El link activo de la nav "Principal" tiene `aria-current="page"`, su `color` es exactamente `--accent-ink`, pesa más que los inactivos y va en versalitas | P1 |
| DS-17 | La barra inferior de mobile usa íconos del set | `mobile-tab-bar` contiene exactamente 5 `[data-icon]`: library, search, plus-circle, bolt, user (epic #183) | P2 |
| DS-18 | Las instrucciones de Conexiones van plegadas | En la tarjeta de PSN el campo NPSSO es visible de entrada, el link a playstation.com está oculto detrás de "Cómo conseguir el NPSSO" y aparece al abrirlo | P1 |
| DS-19 | El chip de estado de una conexión pinta con su token semántico | El `color` computado de `connection-status` es exactamente `--success` / `--warning` / `--ink-muted` según su `data-status` | P2 |
| DS-20 | La pantalla offline usa un ícono del set | `/offline` muestra `[data-icon="offline"]` y no contiene 📡 | P2 |
| DS-21 | Tokens de la paleta refinada (#184) | `--chrome`, `--chrome-raised`, `--rating`, `--rating-muted` y `--like` tienen valor, y `--rating` resuelve exactamente al mismo color que `--accent-ink` (y no al oro) | P1 |
| DS-22 | Chrome del header y de la barra inferior | En mobile, el `background-color` computado de `mobile-tab-bar` es exactamente `--chrome-raised` (sólido, sin `/95`), el del `header` es `--chrome`, y el tab activo pinta con `--accent-ink` | P1 |
| DS-23 | Tus estrellas usan `rating` | En la tab Reseñas de `/juegos/[id]`, tu entrada 9/10 dibuja 5 estrellas `data-rating-tone="own"` y la llena tiene el `color` exacto de `--rating` | P1 |
| DS-24 | Las estrellas de otro usuario usan `rating-muted` | La entrada 7/10 de userB, bajo "Otros usuarios", dibuja 5 estrellas `data-rating-tone="others"` con el `color` exacto de `--rating-muted`, distinto de `--rating` | P2 |

### 6.19 Navegación de 5 botones (`22-navigation.spec.ts`)

Shell de navegación del epic #183 (issue #185): barra inferior de 5 botones en mobile, header
con buscador / Registrar / menú de cuenta en escritorio, tabs deslizables por sub-sección y
redirects de las rutas viejas. Los casos de mobile corren con el Pixel 7 vía `test.use` dentro
del mismo archivo (proyecto `authed`).

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| NAV-01 | Barra inferior de 5 botones | `mobile-tab-bar` tiene, en orden, Biblioteca, Buscar, Registrar, Actividad y Perfil, nombrados por `aria-label` (sin texto visible) | P1 |
| NAV-02 | El activo se mueve al navegar | En `/biblioteca` el botón Biblioteca tiene `aria-current="page"`; al tocar Buscar pasa a Buscar y Biblioteca lo pierde | P1 |
| NAV-03 | El + abre un diálogo | El botón Registrar tiene `aria-haspopup="dialog"`, abre el diálogo "Registrar" sin cambiar la URL, con "Registrar un juego terminado" y "Marcar un juego como jugando" habilitados (#187) | P1 |
| NAV-04 | Tabs deslizables | En mobile, un swipe a la izquierda en `/actividad` lleva a `/actividad/vos` y uno a la derecha vuelve; un gesto corto no navega. En escritorio, →, Inicio y ← (con vuelta) cambian de tab, de URL y de foco | P1 |
| NAV-05 | Redirects de rutas viejas | `/juegos?fuente=steam&q=zelda` → `/biblioteca?fuente=steam&q=zelda`; `/diario?nuevo=1` → `/perfil/diario?nuevo=1` con el modal abierto; `/diario/amigos` → `/biblioteca/resenas`; `/diario/resumen` no se mueve | P0 |
| NAV-06 | Configuración en el engranaje | La barra inferior no tiene Configuración; el engranaje del header de `/perfil` lleva a `/configuracion/conexiones` | P1 |
| NAV-07 | Header de escritorio | Nav Biblioteca · Actividad · Perfil; "Registrar" abre el diálogo; el menú "Cuenta" tiene Perfil, Configuración y Cerrar sesión y cierra con Escape; Enter en el buscador lleva a `/buscar?q=` | P1 |

### 6.20 Ficha de juego unificada (`23-game-page.spec.ts`)

Ficha con tabs del epic #183 (issue #186): un solo hero, panel de acciones y tres tabs en la
URL (Reseñas en `/juegos/[id]`, Trofeos en `/trofeos`, Guías e IA en `/guias`). Los IDs son
`FICHA-` porque `GAME-0x` ya existen en §6.4. El caso "el chip del advisor abre la tab Trofeos y
enfoca el trofeo" que listaba el issue es AI-10 (§6.7), actualizado.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| FICHA-01 | Juego fuera de tu biblioteca | userB abre la ficha de un juego que sólo tiene userA: se ve el hero y la tab Trofeos (la default), que explica que no está en su biblioteca y no muestra trofeos | P0 |
| FICHA-02 | Redirects de las fichas viejas | `/juegos/[id]/diario` → `/juegos/[id]/resenas`, `/juegos/[id]/trofeos` → `/juegos/[id]` (Trofeos) y `/juegos/[id]/enlaces` → `/juegos/[id]/guias` | P0 |
| FICHA-03 | Tabs en la URL | Abre en Trofeos; → con el teclado recorre Trofeos → Reseñas → Guías e IA cambiando la URL; recargar conserva la tab | P1 |
| FICHA-04 | Materializar un juego de catálogo | `/juegos/catalogo/[rawgId]` (RAWG mockeado) redirige a la ficha; abrirlo dos veces deja **una** fila `source = 'catalog'` y no vincula el juego a `user_games` | P0 |
| FICHA-05 | Registrar desde el panel | Jugando, Playlist y Lista arrancan con `aria-pressed="false"` (cada uno con su caso: PLAY-02, PLIST-01, LIST-03); "Registrar o puntuar" abre el diálogo, guarda la entrada y agrega el juego a `user_games` | P1 |
| FICHA-06 | Imagen a pantalla completa | Tocar la carátula de la ficha abre un visor (`role="dialog"`) con la imagen; Escape lo cierra. Mismo visor que las capturas de la galería | P1 |
| FICHA-07 | Sinopsis corta | Una descripción de varios párrafos muestra sólo el primero; `toSynopsis` corta en una oración completa dentro de 280 caracteres (test puro) | P1 |

### 6.21 Jugando ahora (`24-now-playing.spec.ts`)

"Jugando ahora" del epic #183 (issue #187): tabla `now_playing` (una racha por fila, con
historial), el + con la sugerencia del último juego abierto, el toggle de la ficha, la fila del
perfil y de la biblioteca, las salidas automáticas y el banner "¿Empezaste X?". PLAY-04 vive en
`03-sync-library.spec.ts` (necesita la cuenta PSN de userB y el sync mockeado, que ese archivo
corre en serie) y PLAY-06 en `24-now-playing.spec.ts`, porque `12-security-isolation.spec.ts`
no existe todavía.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| PLAY-01 | El + sugiere el último juego abierto | Con un juego de `last_played_at` reciente, el diálogo "Registrar" pregunta "¿Estás jugando X?"; "Sí, lo estoy jugando" abre una racha en `now_playing` | P1 |
| PLAY-02 | Marcar como jugando se ve en perfil y ficha | El toggle "Jugando" de la ficha pasa a `aria-pressed="true"`, el juego aparece en "Jugando ahora" de `/perfil` y de `/perfil/[id]` visto por otro usuario, y "Dejé de jugarlo" lo saca con `end_reason = 'manual'` | P0 |
| PLAY-03 | Registrar la partida lo saca de jugando | Guardar una entrada de diario de un juego que estás jugando cierra la racha con `end_reason = 'diary_entry'` | P0 |
| PLAY-04 | El platino del sync lo saca de jugando | Una racha abierta antes del platino del juego mockeado se cierra en el sync con `end_reason = 'platinum'` | P1 |
| PLAY-05 | Sin rachas dobles | Marcar dos veces el mismo juego deja una sola racha abierta (unique parcial) y la segunda vez avisa "Ya lo estás jugando" | P1 |
| PLAY-06 | RLS de `now_playing` | userB no puede insertar ni cerrar una racha de userA con su propia sesión; sí puede leerla | P0 |
| PLAY-07 | Sugerencia de la biblioteca | `/biblioteca` muestra "¿Empezaste X?" para un juego abierto hace poco; "Descartar" lo esconde y no vuelve al recargar | P1 |

### 6.22 Playlist (`25-playlist.spec.ts`)

La Playlist del epic #183 (issue #188), el equivalente de la Watchlist de Letterboxd:
`user_playlist` (pública, escritura sólo del dueño), el toggle optimista de la ficha, la
pantalla `/perfil/playlist` con sus órdenes y la salida automática al empezar a jugar un juego
o registrarlo como terminado.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| PLIST-01 | Agregar desde la ficha | El toggle "Playlist" pasa a `aria-pressed="true"` y el juego aparece en `/perfil/playlist` | P0 |
| PLIST-02 | Quitar | Volver a tocar el toggle lo deja en `aria-pressed="false"` y el juego ya no está en `/perfil/playlist` | P1 |
| PLIST-03 | Jugarlo lo saca de la Playlist | Marcar como jugando un juego de la Playlist avisa "Sacado de tu Playlist." y borra la fila | P0 |
| PLIST-04 | Pública pero ajena | userB ve la Playlist de userA en `/perfil/[id]`; con su sesión no puede agregar ni borrar filas de userA | P0 |
| PLIST-05 | Orden por tiempo estimado | `?orden=tiempo` ordena por `time_to_beat_minutes` ascendente, con los que no tienen dato al final | P1 |

### 6.23 Listas (`26-lists.spec.ts`)

Listas de usuario del epic #183 (issue #189): `user_lists` + `user_list_items` (públicas o
privadas, escritura sólo del dueño), el editor (`/listas/nueva`, `/listas/[id]/editar`), la ficha
(`/listas/[id]`) y "Agregar a una lista" desde la ficha del juego. Desde el issue #192, también
Biblioteca › Listas (`/biblioteca/listas`) y las listas pregeneradas (`system_lists`, que refresca
el paso `?paso=listas` de `/api/cron/sync`, y las personalizadas que se calculan al vuelo). Los
casos que llaman al cron necesitan `CRON_SECRET` y se saltean sin él. El tercer usuario que puntúa
se crea en el propio spec: el diario de userC lo borra `28-library-home` desde el otro worker.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| LIST-01 | Crear una lista con 3 juegos | Desde `/listas/nueva`, con título y tres juegos agregados con el buscador, "Guardar lista" abre la ficha de la lista con los tres juegos y la lista aparece en Perfil › Listas | P0 |
| LIST-02 | Reordenar y editar nota | En `/listas/[id]/editar`, "Bajar" cambia el orden y la nota se guarda: la base queda con las posiciones nuevas y la vista "Detalle" muestra la nota | P1 |
| LIST-03 | Agregar a una lista desde la ficha | El toggle "Lista" abre "Agregar a una lista"; tocar una lista la marca (`aria-pressed="true"`) y agrega el juego al final | P0 |
| LIST-04 | Lista privada | Otro usuario recibe 404 en `/listas/[id]` y su sesión no la lee (RLS) | P0 |
| LIST-05 | Lista ajena de sólo lectura | Otro usuario recibe 404 en `/listas/[id]/editar`, y con su sesión no puede cambiar el título ni agregar juegos | P0 |
| LIST-06 | "Vos jugaste N de M" | Con un juego platinado, uno con entrada de diario y uno sin jugar, la ficha dice "Vos jugaste 2 de 3" | P1 |
| LIST-10 | La tab muestra primero lo de amigos | En `/biblioteca/listas`, una lista pública de un amigo aparece en "Nuevas de tus amigos", esa sección va arriba de "Armadas por Platinoob" y la fila abre la ficha de la lista | P0 |
| LIST-11 | "Mejor puntuados" respeta el mínimo | Tras el refresco del cron, cinco juegos con 3 valoraciones de 10 entran en `mejor-puntuados` y en "Lo mejor de 1972"; uno con 2 valoraciones de 10 no aparece en ninguna | P0 |
| LIST-12 | Menos de 5 juegos no se muestra | Con sólo cuatro juegos puntuados de 1971, no hay fila `mejor-de-1971`, su ficha da 404 y la tab no la lista | P1 |
| LIST-13 | El cron refresca `system_lists` | `?paso=listas` sin `CRON_SECRET` da 401; con él, `mejor-de-1973` queda con `item_count = 5`, `refreshed_at` nuevo, exactamente los cinco juegos, y aparece en la tab | P0 |
| LIST-14 | "Populares entre tus amigos" es personal | Si userB sigue a userA, la lista de userB muestra los juegos del diario de userA y la de userA no; cuando userB deja de seguirlo, los juegos desaparecen | P1 |

### 6.24 Likes (`27-likes.spec.ts`)

Likes del epic #183 (issue #190): `review_likes` y `list_likes`, públicos, sin likes a lo propio ni
a una lista privada ajena (Server Action + RLS). El corazón es un toggle optimista con
`aria-pressed`.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| LIKE-01 | Likear una reseña ajena | En la tab Reseñas de la ficha, "Me gusta la reseña de X" pasa a `aria-pressed="true"`, el contador dice 1 y sigue así al recargar | P0 |
| LIKE-02 | Quitar el like | Volver a tocarlo lo deja en `aria-pressed="false"`, sin contador, y borra la fila | P1 |
| LIKE-03 | No se likea lo propio | Sobre tu reseña y tu lista no hay corazón; con tu sesión la RLS rechaza el insert en `review_likes` y en `list_likes` | P0 |
| LIKE-04 | Lista privada ajena | Con la sesión de userA, la RLS rechaza el like a una lista privada de userB | P0 |
| LIKE-05 | Cascade | Borrar la reseña borra sus likes | P1 |
| LIKE-06 | Likear una lista pública ajena | En `/listas/[id]`, "Me gusta la lista X" pasa a `aria-pressed="true"`, guarda la fila y sigue así al recargar | P1 |

### 6.25 Estudios (`29-studios.spec.ts`)

Estudios de IGDB del epic #183 (issue #193): `companies` / `game_companies`, lectura pública y
escritura sólo por service role. Corren contra el mock de `lib/igdb/mocks.ts`: todo juego `[E2E]`
lo desarrolla "[E2E] Estudio" y lo publica "[E2E] Editora", y el estudio tiene dos juegos (A y B)
que no están en `games`. Los ids de test de IGDB viven arriba de `E2E_IGDB_ID_MIN`.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| STUDIO-01 | Estudios en la ficha | El hero de `/juegos/[id]` muestra "[E2E] Estudio" y "[E2E] Editora" como links a `/estudios/<slug>` | P0 |
| STUDIO-02 | Perfil de estudio | `/estudios/e2e-estudio` muestra el nombre, "Parte de [E2E] Editora" linkeable y los dos juegos en Desarrollados; la Editora los lista en Publicados | P0 |
| STUDIO-03 | Materializar un juego de IGDB | Tocar un juego que no está en `games` crea la fila (`external_catalog_id = igdb:<id>`) y abre su ficha | P1 |
| STUDIO-04 | IGDB caído no se cachea | Con IGDB `unavailable`, la ficha carga y `games.companies_checked_at` queda en NULL | P0 |
| STUDIO-05 | "Jugaste N de M" | Con una reseña en el diario de un juego del estudio (vinculado por `igdb_id`), el perfil dice "Vos jugaste 1 de 2" y el póster lleva la marca "Jugado" | P1 |

### 6.26 Buscar (`30-search.spec.ts`)

Búsqueda del epic #183 (issue #194): tabs Juegos · Estudios · Listas · Usuarios en `/buscar?q=&en=`
y búsquedas recientes (`recent_searches`, privadas, tope de 20). Guardar pasa sólo por
`/buscar/ir` (Enter o abrir un resultado). Los estudios salen del mock de `lib/igdb/mocks.ts`.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| SEARCH-01 | Buscar un juego | Tipear el nombre (sin Enter) muestra el juego en la sección Juegos de la tab Todo y tocarlo abre `/juegos/[id]` | P0 |
| SEARCH-02 | Recientes con ámbito | Enter en la tab Estudios guarda la búsqueda con el chip "Estudios"; repetirla deja una sola fila y tocarla vuelve a esa tab | P0 |
| SEARCH-03 | Borrar recientes | ✕ borra una fila y "Borrar todo" vacía la sección | P1 |
| SEARCH-04 | Tab Estudios | "[E2E] Estudio" aparece con "2 juegos" y lleva a `/estudios/e2e-estudio` | P1 |
| SEARCH-05 | Listas privadas | La tab Listas muestra la lista pública de otro usuario y no su privada | P0 |
| SEARCH-06 | Tope de 20 | Con 20 recientes, una búsqueda nueva deja 20 y se va la más vieja | P1 |
| SEARCH-07 | URL | `?q=&en=usuarios` después de recargar conserva el campo y la tab Usuarios | P1 |
| SEARCH-08 | Tab Todo | Tipear sin elegir ámbito deja la tab Todo seleccionada con el juego en la sección Juegos; "Ver todo" lleva a `en=juegos` y el campo conserva lo tipeado | P0 |

### 6.27 Actividad (`31-activity.spec.ts`)

Actividad del epic #183 (issue #195): Amigos / Vos / Recibido, derivadas por RPC
(`get_activity_friends` / `_self` / `_received`) sin tabla de eventos. Paginación por cursor
`(occurred_at, id)` de a 30 y filtro en `?tipo=`.

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| ACT-01 | Diario de un amigo | La entrada de userB aparece en `/actividad` de userA (que lo sigue) con el link al juego | P0 |
| ACT-02 | Platino privado | El platino de userA aparece en Vos y el RPC de amigos de userB (que lo sigue) no lo devuelve | P0 |
| ACT-03 | Like recibido | Un like de userB a la reseña de userA aparece en Recibido | P0 |
| ACT-04 | Borrar | Borrar la entrada de diario la saca del log | P0 |
| ACT-05 | Paginación | Con 32 eventos se ven 30, "Cargar más" suma los 2 restantes sin repetir | P1 |
| ACT-06 | Fechas | Tiempo relativo (min / h / d / sem) y `2026-09-23` como "el miércoles 23 de septiembre", sin desfase de día | P1 |

**Total: 194 casos** — 79 P0, 85 P1, 30 P2.

---

## 7. Convenciones de código de tests

### 7.1 Selectores — en este orden, sin excepciones

1. **Rol accesible**: `getByRole("button", { name: "Generar plan" })`. Es lo primero
   siempre: si el test no lo encuentra por rol, probablemente haya un problema real de
   accesibilidad (los issues #28/#69 ya pasaron por ahí).
2. **Label / texto**: `getByLabel("NPSSO")`, `getByText(...)`.
3. **`data-testid`**: último recurso, solo para lo que no tiene nombre accesible estable
   (una tarjeta en una grilla, un contenedor de gráfico).

- ❌ Nunca selectores CSS por clase de Tailwind — cambian con cada retoque de diseño.
- ❌ Nunca `nth-child` ni índices posicionales sobre listas dinámicas.
- Los `data-testid` que se agreguen al código de producción se listan en §7.5 y llevan
  prefijo del área: `game-card`, `trophy-item`, `diary-entry`, `friend-row`.

### 7.2 Esperas

- ❌ Prohibido `waitForTimeout`. Sin excepciones.
- ✅ Web-first assertions (`await expect(locator).toBeVisible()`), que reintentan solas.
- Para Server Actions: esperar el efecto observable (el texto nuevo, el ítem en la lista),
  nunca una respuesta de red.
- **Cuidado con el mensaje de éxito de un form cuando la action hace `revalidatePath`**: si
  la página se vuelve a renderizar en otra rama (ej. la tarjeta de Conexiones pasa de "no
  conectada" a "conectada"), el form que mostraba ese mensaje se desmonta y el texto puede
  no llegar a estar visible nunca. Assertear el **estado final** (el badge, la fila nueva),
  no el cartel intermedio.

### 7.3 Estructura de un spec

```ts
test.describe("Enlaces externos", () => {
  test.beforeEach(async ({ seedGame }) => { /* seed propio del spec */ });

  test("LINK-01: buscar guías externas las muestra con su fuente", async ({ page }) => {
    // Arrange → Act → Assert, con una sola razón de fallo por test
  });
});
```

- El título del test **empieza con el ID de la matriz**. Eso hace que un fallo en CI se
  rastree hasta este documento en un paso.
- Un test = un comportamiento. Nada de tests-río que recorren media app.
- La única excepción: `03-sync-library.spec.ts` tiene un test `@journey` que recorre el
  flujo completo del issue #30 de punta a punta, como red de seguridad de integración.

### 7.4 Reglas de determinismo

- Todo dato creado lleva el `runId` de la corrida en el nombre.
- `fullyParallel: true`; ningún test puede depender del orden.
- `retries: 2` solo en CI. **Un test que necesita retries en local es un test roto**, se
  arregla, no se tolera.
- Prohibido `test.only` en `main` (lo bloquea `forbidOnly` en CI).

### 7.5 `data-testid` a agregar en el código de producción

| testid | Componente | Para qué |
| --- | --- | --- |
| `game-card` | `app/(app)/juegos/GamesLibrary.tsx` | Contar y filtrar juegos en la grilla de carátulas |
| `trophy-item` | `app/(app)/juegos/[id]/TrophyItem.tsx` | Assertear grayscale y tipo |
| `diary-entry` | `components/diary/DiaryTimeline.tsx` | Contar entradas por mes |
| `diary-month` / `diary-day` | `components/diary/DiaryTimeline.tsx` | Cada mes del diario y el recuadro del día (DIARY-20) |
| `profile-list` | `components/lists/ProfileLists.tsx` | Filas de Perfil › Listas, propio y ajeno (PROF-22) |
| `sync-status` | `components/SyncStatusBadge.tsx` | Estado del sync |
| `ai-plan` | `app/(app)/juegos/[id]/AiAdvisorPanel.tsx` | Presencia del plan generado |
| `profile-bio` | `components/profile/ProfileHeader.tsx` | La bio del perfil (PROF-20) |
| `rating-histogram` | `components/profile/RatingHistogram.tsx` | Las 10 barras de "Tus puntuaciones" |
| `profile-stats` | `components/profile/ProfileStatsMenu.tsx` | Las filas de Estadísticas (PROF-17/19) |
| `own-review` | `app/(app)/perfil/(expandidos)/resenas/page.tsx` | Filas de `/perfil/resenas` (PROF-08/15) |
| `played-game` / `platinum-game` / `completed-game` | expandidos de `/perfil/*` | Pósters de cada expandido (PROF-16/19) |
| `liked-review` / `liked-list` / `profile-person` | `/perfil/likes`, `PeopleList` | Filas de Likes, Siguiendo y Seguidores |
| `connection-card` | `components/connections/ConnectionCard.tsx` | Identificar la tarjeta de cada plataforma en Conexiones |
| `connection-status` | `components/connections/ConnectionCard.tsx` | Estado de la conexión (`data-status`: connected / attention / disconnected) |
| `mobile-tab-bar` | `app/(app)/MobileTabBar.tsx` | Navegación inferior de mobile |
| `tab-bar-spacer` | `app/(app)/layout.tsx` | Verificar que la barra `fixed` no tape el contenido |
| `install-app-card` | `components/pwa/InstallAppCard.tsx` | Alta de la PWA en Conexiones |
| `install-app-button` | `components/pwa/InstallAppCard.tsx` | Botón que dispara el diálogo nativo de instalación |
| `update-banner` | `components/pwa/PwaRuntime.tsx` | Aviso de versión nueva de la app instalada |
| `screenshot-import-groups` | `components/diary/ScreenshotImporter.tsx` | Grupos detectados al importar capturas en masa |
| `time-to-beat` | `components/game/TimeToBeat.tsx` | Tiempos estimados de juego en las dos fichas |
| `favorite-game` | `components/profile/FavoriteGamesSection.tsx` | Carátulas del Top 5 de un perfil |
| `favorite-candidate` | `components/profile/TopFiveEditor.tsx` | Juegos elegibles en el editor del Top 5 |
| `favorite-catalog-results` | `components/profile/TopFiveEditor.tsx` | Bloque de resultados de catálogo del editor del Top 5 |
| `favorite-catalog-result` | `components/profile/TopFiveEditor.tsx` | Cada juego de catálogo que se puede sumar al Top 5 |
| `profile-diary-entry` | `components/profile/DiaryPreviewSection.tsx` | Últimas reseñas de un perfil |
| `friend-link` | `components/profile/FriendsStrip.tsx` | Acceso al perfil de cada amigo |

Agregar un `data-testid` es un cambio en producción: va en el mismo PR que el test que lo
usa, nunca por adelantado "por las dudas".

**`data-icon` no es un `data-testid`.** `components/ui/Icon.tsx` lo emite siempre, para
cualquier ícono del set: es parte de la API del componente (identifica *qué* ícono se
renderizó) y existiría igual sin tests. Los specs pueden usarlo como selector, pero no se
agregan `data-icon` sueltos a mano en otros componentes.

---

## 8. CI y ejecución

### 8.1 Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run e2e` | Suite determinista, headless, con mocks |
| `npm run e2e:ui` | Modo UI de Playwright para desarrollar tests |
| `npm run e2e:headed` | Con browser visible, para debuggear |
| `npm run e2e:live` | Solo los `@live`, con integraciones reales |
| `npm run e2e:smoke` | Smoke contra `PLAYWRIGHT_BASE_URL` |
| `npm run e2e:report` | Abre el último reporte HTML |

### 8.2 GitHub Actions

Workflow `.github/workflows/e2e.yml`, en cada PR y en push a `master`:

1. `npm ci` + `npx playwright install --with-deps chromium`
2. `npm run build` (el `webServer` de Playwright levanta `next start`)
3. `npm run e2e`
4. Sube `playwright-report/` y los traces como artifact, siempre

Secrets requeridos en el repo: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `PSN_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`. **No** se cargan
`AI_PROVIDER_API_KEY`, `RAWG_API_KEY`, `STEAMGRIDDB_API_KEY` ni `STEAM_API_KEY`: con
`E2E_MOCKS=1` no hacen falta, y su ausencia además verifica que la app degrada bien.

El smoke contra Vercel corre en un job aparte, disparado a mano
(`workflow_dispatch`) o tras un deploy, con `PLAYWRIGHT_BASE_URL` apuntando a producción.

### 8.3 Definition of Done del issue #30

- [ ] `playwright.config.ts`, fixtures y helpers en el repo
- [ ] Los 30 casos **P0** implementados y en verde
- [ ] Los 40 casos **P1** implementados y en verde
- [ ] Los P2 implementados o con un issue de seguimiento abierto
- [ ] El interruptor `E2E_MOCKS` implementado en los 4 módulos de `lib/`
- [ ] Workflow de CI en verde sobre un PR real
- [ ] Smoke contra Vercel corrido a mano al menos una vez
- [ ] `README.md` con la sección de cómo correr los tests
- [ ] Issue #30 actualizado con un comentario y el PR vinculado (convención de `CLAUDE.md`)

---

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Tests escribiendo en la base real (R7) | Alto | Prefijo `[E2E]`/`E2E-%` + teardown que corre siempre + limpieza defensiva en el setup |
| Flakiness por Server Actions y revalidación | Medio | Cero `waitForTimeout`; solo web-first assertions sobre efectos observables |
| Mocks que se desincronizan de la API real | Medio | Suite `@live` corrida antes de cada release; las fixtures se derivan de payloads reales |
| El `E2E_MOCKS` se filtra a producción | **Alto** | Solo se lee dentro de `lib/**`; Vercel nunca la define; un test verifica que sin la variable se intenta la llamada real |
| Rate limit de Groq en los `@live` | Bajo | Se corren de a uno, a mano |
| `SUPABASE_SERVICE_ROLE_KEY` en los secrets de CI | Medio | Secret de GitHub, nunca en logs; los tests que la usan no imprimen sus valores |
| Tiempo de CI creciendo | Bajo | `fullyParallel`, solo Chromium, `next start` sobre un build cacheado |

---

## 10. Deuda detectada durante la redacción de este PRD

Encontrada al revisar el código para armar la matriz. **Va a issues aparte, no se arregla
dentro del PR de testing:**

1. ~~**`[DEBUG]` en el error de login**~~ — resuelto en el issue #126: el mensaje genérico es
   el único que llega al cliente, en login y en registro, y los errores de Supabase van a
   `console.error`. Cubierto por AUTH-04/AUTH-05.
2. **No hay forma de editar `users.display_name`** — documentado en `CLAUDE.md`; un usuario
   sin PSN queda como "Usuario sin nombre" para siempre. Afecta FRIEND-06.
3. **`nextPlaythroughNumber` no es race-safe** — conocido y aceptado; no se testea la
   condición de carrera, pero DIARY-07 sí verifica el camino feliz.

---

## 11. Plan de implementación

| Fase | Contenido | Estado |
| --- | --- | --- |
| **A** | Setup: `playwright.config.ts`, fixtures, helpers, global setup/teardown, scripts, CI | ✅ Este PR |
| **B** | Interruptor `E2E_MOCKS` en `lib/psn`, `lib/ai`, `lib/covers`, `lib/external-guides` | ✅ `lib/covers`/`lib/external-guides` ya venían del trabajo de Steam; esta pasada agregó `lib/psn/mocks.ts` y `lib/ai/mocks.ts` (ver §4.1 actualizado abajo) |
| **C** | Specs P0 (30 casos) | 🟡 Parcial -- ver nota abajo |
| **D** | Specs P1 (40 casos) + `data-testid` que requieran | Sin empezar |
| **E** | Specs P2, `@live`, smoke en Vercel | Sin empezar (smoke ya existía de la Fase A) |

**Nota Fase C (parcial):** de los 30 P0, quedaron cubiertos AUTH-01/02/03/04/09,
PSN-03/04/06, SYNC-01/03/04/06/11, GAME-01/07, AI-02/05 y los 9 de Steam que
ya traía `13-steam.spec.ts`. Quedan sin cubrir: LINK-03 (necesita un segundo `webServer` sin
`SUPABASE_SERVICE_ROLE_KEY`, incompatible con la instancia compartida que usa el resto de la
suite -- requiere resolver primero cómo aislarlo antes de escribir el test), y los P0 de
DIARY (01/06/11/15), FRIEND (03/07/08), PROF-01 y SEC (01/02/03/04). No se pudo correr
`npm run e2e` en este entorno por falta de credenciales de Supabase (`.env.test.local`/
`.env.local` no existen acá); sí se verificó que la suite completa levanta sin errores de
sintaxis con `npx playwright test --list` y que `npx tsc --noEmit`/`npm run lint` quedan
limpios.
