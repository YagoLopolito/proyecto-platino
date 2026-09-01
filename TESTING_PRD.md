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
    05-guides.spec.ts
    06-external-links.spec.ts
    07-ai-advisor.spec.ts
    08-diary.spec.ts
    09-friends.spec.ts
    10-profile.spec.ts
    11-a11y-mobile.spec.ts
    12-security-isolation.spec.ts
    13-steam.spec.ts
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
| `mobile` | `user.json` | `11-a11y-mobile` | Pixel 7, valida lo del PR #101 |
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
| SYNC-09 | Orden por última jugada | Sin recarga de página (PR #49) | P2 |
| SYNC-10 | Juegos `source='catalog'` no aparecen | Un juego de catálogo del diario no se lista en `/juegos` | P1 |
| SYNC-11 | `/api/cron/sync` sin `CRON_SECRET` | 401 | **P0 (seguridad)** |
| SYNC-12 | `/api/cron/sync` con bearer correcto | 200 con resumen por cuenta | P1 |
| SYNC-13 | Horas jugadas de PSN | `playtime_minutes` guardado desde `playDuration`, visible en la tarjeta de `/juegos` y en la ficha de diario; un juego sin horas reportadas no muestra nada | P1 |
| SYNC-14 | Paginación de horas de PSN | `decideNextPage` no corta en la primera página cuando falta `totalItemCount` y recorre una biblioteca grande en páginas chicas | P1 |
| SYNC-15 | Fallo parcial de horas de PSN | Si una página de la lista de juegos jugados falla, `fetchPsnPlaytime` devuelve las páginas ya obtenidas en vez de perder el mapa entero | P1 |
| SYNC-16 | RLS de `user_games` | El usuario puede actualizar su propia fila: el segundo upsert del sync (ON CONFLICT DO UPDATE) no lo rechaza la RLS | P0 |
| SYNC-17 | Cruce de nombres de PSN | `playtimeMatchKey` ignora el sufijo del set de trofeos ("… Trophies") y el de plataforma, sin colapsar juegos distintos | P1 |

### 6.4 Detalle de juego (`04-game-detail.spec.ts`)

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| GAME-01 | Lista de trofeos completa | Todos los del fixture, agrupados y en orden (PR #76) | P0 |
| GAME-02 | Trofeos no obtenidos en b/n | Filtro grayscale presente; los obtenidos en color (PR #102) | P1 |
| GAME-03 | Barra de progreso | % coincide con obtenidos/total | P1 |
| GAME-04 | Rareza y DLC | Se muestran cuando el fixture los trae (PR #87) | P2 |
| GAME-05 | Breadcrumb | Volver lleva a `/juegos` desde guías/enlaces/diario (issue #60) | P1 |
| GAME-06 | `id` inexistente | Estado de error/404 controlado, no un stack trace | P1 |
| GAME-07 | Juego de otro usuario | No se filtran trofeos ajenos (RLS) | **P0 (seguridad)** |

### 6.5 Guías propias (`05-guides.spec.ts`)

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| GUIDE-01 | Crear guía | Aparece en la lista; el form está detrás del `<details>` colapsado | P1 |
| GUIDE-02 | Editar guía propia | Cambios persisten tras recargar | P1 |
| GUIDE-03 | Borrar guía propia | Desaparece, junto con sus pasos | P1 |
| GUIDE-04 | Agregar paso ligado a un trofeo | El paso muestra el trofeo asociado | P1 |
| GUIDE-05 | Tildar un paso | `user_guide_progress` persiste tras recargar | P0 |
| GUIDE-06 | Auto-tilde por trofeo sincronizado | Paso ligado a un trofeo ya obtenido aparece tildado solo (issue #18) | P0 |
| GUIDE-07 | userB no puede editar la guía de userA | Sin controles de edición; la Server Action rechaza | **P0 (seguridad)** |
| GUIDE-08 | Checklist independiente por usuario | El progreso de userB no afecta el de userA | P1 |
| GUIDE-09 | Guía sin pasos | `EmptyState`, no una lista vacía sin explicación | P2 |

### 6.6 Enlaces externos (`06-external-links.spec.ts`)

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| LINK-01 | Buscar guías externas (mock) | Aparecen guía de Steam + 3 links de búsqueda, con atribución de fuente | P1 |
| LINK-02 | Sin resultados | `EmptyState`, no un error | P2 |
| LINK-03 | Falta `SUPABASE_SERVICE_ROLE_KEY` | Error mostrado en la UI, **no** un 500 "This page couldn't load" (regresión documentada en `CLAUDE.md`) | P0 |
| LINK-04 | No se duplican | Buscar dos veces no duplica filas (upsert `game_id,url`) | P1 |
| LINK-05 | Links con `target=_blank` + `rel=noopener` | Atributos presentes | P2 |

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
| AI-10 | Clic en un trofeo del plan | Lleva al trofeo en la lista de arriba y le abre la ayuda de "cómo desbloquearlo" ya cargada | P1 |
| AI-11 | Siguiente trofeo | La tarjeta "Siguiente trofeo" muestra un trofeo pendiente con los pasos para desbloquearlo, y clickearlo lleva al trofeo en la lista | P1 |
| AI-12 | Trofeos de acumulación | El plan lista los trofeos que piden juntar una cantidad, con su objetivo, su categoría y el aviso cuando no se pueden farmear después | P1 |
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

### 6.10 Perfil (`10-profile.spec.ts`)

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| PROF-01 | Stats globales | Juegos en biblioteca, trofeos por tipo y % coinciden con el fixture | P0 |
| PROF-02 | Nivel de trofeos de PSN | Se muestra el que trajo la conexión (PR #103) | P1 |
| PROF-03 | Juegos de catálogo no cuentan | "Juegos en biblioteca" los excluye | P1 |
| PROF-04 | Perfil sin PSN conectada | CTA a conectar, sin números en cero confusos | P1 |
| PROF-05 | Coherencia con `/juegos` | Los totales del perfil coinciden con los de la biblioteca (mismo RPC) | P1 |

### 6.11 Accesibilidad y mobile (`11-a11y-mobile.spec.ts`) — proyecto `mobile`

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| A11Y-01 | Sin scroll horizontal | 375px de ancho en `/`, `/juegos`, `/juegos/[id]`, `/diario`, `/perfil` (PR #101) | P1 |
| A11Y-02 | Foco visible por teclado | Tabular por login y por la biblioteca muestra el anillo de foco (issue #69) | P1 |
| A11Y-03 | Navegación por teclado en modales | Escape cierra; el foco queda atrapado dentro (`components/Modal.tsx`) | P1 |
| A11Y-04 | Imágenes con `alt` | Carátulas e íconos de trofeo con texto alternativo | P2 |
| A11Y-05 | Jerarquía de headings | Un solo `h1` por página | P2 |
| A11Y-06 | Contraste WCAG AA | `@axe-core/playwright` sin violaciones serias en las 5 rutas principales | P1 |

### 6.12 Aislamiento y seguridad (`12-security-isolation.spec.ts`)

| ID | Caso | Resultado esperado | Prio |
| --- | --- | --- | --- |
| SEC-01 | Trofeos privados | userB no ve `user_trophies` de userA por ninguna vía | P0 |
| SEC-02 | Secretos nunca en el cliente | Ninguna respuesta contiene `npsso`, `service_role`, `AI_PROVIDER_API_KEY` ni `CRON_SECRET` | P0 |
| SEC-03 | Server Actions validan autoría | Editar guía / entrada de diario ajena falla del lado del servidor, no solo por UI oculta | P0 |
| SEC-04 | Sin sesión, las Server Actions rechazan | Invocarlas con las cookies borradas devuelve error de auth | P0 |
| SEC-05 | Consola limpia | Ningún `console.error` en el recorrido feliz completo | P1 |

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

**Total: 99 casos** — 39 P0, 42 P1, 18 P2.

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
test.describe("Guías propias", () => {
  test.beforeEach(async ({ seedGame }) => { /* seed propio del spec */ });

  test("GUIDE-01: crear una guía la muestra en la lista", async ({ page }) => {
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
| `game-card` | `components/GameCard.tsx` | Contar y filtrar juegos en la biblioteca |
| `trophy-item` | `app/(app)/juegos/[id]/TrophyItem.tsx` | Assertear grayscale y tipo |
| `diary-entry` | `components/diary/DiaryTimeline.tsx` | Contar entradas por mes |
| `friend-row` | `components/friends/FriendsDiaryFeed.tsx` | Identificar amigos en el feed |
| `sync-status` | `components/SyncStatusBadge.tsx` | Estado del sync |
| `ai-plan` | `app/(app)/juegos/[id]/AiAdvisorPanel.tsx` | Presencia del plan generado |
| `connection-card` | `components/connections/ConnectionCard.tsx` | Identificar la tarjeta de cada plataforma en Conexiones |
| `connection-status` | `components/connections/ConnectionCard.tsx` | Estado de la conexión (`data-status`: connected / attention / disconnected) |

Agregar un `data-testid` es un cambio en producción: va en el mismo PR que el test que lo
usa, nunca por adelantado "por las dudas".

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
PSN-03/04/06, SYNC-01/03/04/06/11, GAME-01/07, GUIDE-05/06/07, AI-02/05 y los 9 de Steam que
ya traía `13-steam.spec.ts`. Quedan sin cubrir: LINK-03 (necesita un segundo `webServer` sin
`SUPABASE_SERVICE_ROLE_KEY`, incompatible con la instancia compartida que usa el resto de la
suite -- requiere resolver primero cómo aislarlo antes de escribir el test), y los P0 de
DIARY (01/06/11/15), FRIEND (03/07/08), PROF-01 y SEC (01/02/03/04). No se pudo correr
`npm run e2e` en este entorno por falta de credenciales de Supabase (`.env.test.local`/
`.env.local` no existen acá); sí se verificó que la suite completa levanta sin errores de
sintaxis con `npx playwright test --list` y que `npx tsc --noEmit`/`npm run lint` quedan
limpios.
