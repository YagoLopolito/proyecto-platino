# Prompt para Claude Code — Setup profesional del backlog en GitHub (Proyecto Platino)

> Pegá este archivo completo como prompt inicial en Claude Code, parado en la carpeta
> del repo (`E:\Projecto platino`). No hace falta que confirmes nada conmigo: leé el
> contexto, verificá el estado real del repo con `gh`, y ejecutá. Reportá al final un
> resumen de lo que creaste/actualizaste.

## 0. Contexto que tenés que leer primero

Antes de tocar nada, leé completos:
- `CLAUDE.md` — reglas permanentes del proyecto (stack, modelo de datos, convenciones).
- `PRODUCT_SPEC.md` — spec cerrada del MVP, especialmente la sección 10 (roadmap → issues)
  y la sección 11 (Definition of Done). Es la fuente de verdad de qué hay que crear.
- `github-setup.sh` — script previo que arrancó este trabajo. **Ya se ejecutó parcialmente**:
  el repo `YagoLopolito/proyecto-platino` existe, y la Fase 0 (4 issues) ya está creada
  (issues #1–#4). No lo vuelvas a correr tal cual — `gh repo create` va a fallar porque el
  repo ya existe, y recrear labels/milestones/issues sin chequear rompe la idempotencia.
  Usalo solo como referencia de contenido, y al final actualizalo (ver paso 6).

**Repo destino**: `YagoLopolito/proyecto-platino` (ya existe, ya tiene remote configurado).

## 1. Verificación previa (obligatorio, antes de crear nada)

```bash
gh auth status
git remote -v
gh label list --repo YagoLopolito/proyecto-platino
gh api repos/YagoLopolito/proyecto-platino/milestones --paginate
gh issue list --repo YagoLopolito/proyecto-platino --state all --limit 200 --json number,title,milestone,labels
gh project list --owner YagoLopolito
```

Con esto armás el inventario real de qué existe. **Todo lo que sigue es idempotente**:
si un label/milestone/issue con ese título ya existe, no lo recrees — saltealo (o
actualizalo si el contenido difiere sustancialmente). Confirmá primero que los 4 issues de
Fase 0 estén bien etiquetados con `area:infra` y el milestone "Fase 0 - Setup del repo";
si falta algo, corregilo en vez de duplicar.

## 2. Labels

Los labels ya están definidos en `github-setup.sh` (9 labels `area:*`). Verificá que
existan todos con `gh label list`; creá los que falten con `gh label create --force`
(es seguro re-correrlo, `--force` actualiza en vez de fallar).

## 3. Milestones

Creá los milestones que falten (probablemente todos menos "Fase 0 - Setup del repo",
que ya debería existir por los issues #1–#4). Lista completa en `github-setup.sh` /
`PRODUCT_SPEC.md` sección 10: Fase 0 a Fase 10 (11 milestones en total).

## 4. Issues — Fase 1 a Fase 10

Para **cada** issue de abajo: `gh issue create --repo YagoLopolito/proyecto-platino`
con el milestone y labels indicados. El body de cada issue tiene que seguir esta
estructura (más rica que los one-liners del script viejo):

```markdown
## Contexto
<1-2 líneas, por qué existe este issue, con referencia a la sección de PRODUCT_SPEC.md>

## Criterios de aceptación
- [ ] <bullet específico y verificable>
- [ ] <bullet específico y verificable>
...

## Notas técnicas
<boundaries de código, tablas involucradas, RLS, o vacío si no aplica>

## Definition of Done
- [ ] Pasa lint/typecheck sin `any` fuera de boundaries documentados.
- [ ] No hay llamadas a `psn-api` fuera de `lib/psn/`, al LLM fuera de `lib/ai/`, ni a
      APIs de covers fuera de `lib/covers/`.
- [ ] Tablas nuevas con datos de usuario tienen RLS.
- [ ] Al menos un estado de error manejado explícitamente en la UI.
- [ ] Probado manualmente en local (con datos reales de PSN si la fase ya sincroniza).
```

El bloque "Definition of Done" es igual en todos los issues (viene de PRODUCT_SPEC.md
sección 11) — pegalo tal cual. Los criterios de aceptación son específicos por issue,
detallados abajo.

**Regla no negociable sobre imágenes/carátulas/trofeos**: en ningún issue se usan
placeholders, íconos genéricos ni assets inventados. Las imágenes de juegos y trofeos
tienen que salir de fuentes reales:
- **Trofeos e íconos de juego (fuente primaria, sin API key)**: vienen directo en la
  respuesta de `psn-api` cuando se sincroniza la cuenta — cada juego trae su ícono
  oficial y cada trofeo trae su ícono oficial de Sony (verificá los nombres exactos de
  esos campos en los tipos actuales de la librería `psn-api` instalada, porque al ser una
  API no oficial pueden cambiar de nombre entre versiones; históricamente son
  `trophyTitleIconUrl` a nivel de juego y `trophyIconUrl` a nivel de trofeo). Se guardan
  tal cual en `games`/`trophies`, nunca se generan ni se buscan en otro lado.
- **Carátulas tipo "box art" (fuente secundaria, opcional, Fase 8)**: RAWG API primero,
  fallback a SteamGridDB si el juego no aparece. Ambas gratuitas, ambas server-side,
  cacheadas en `games.cover_url`. Nunca scrapear sitios de terceros.

---

### Fase 1 — Auth + esquema base

**1. Auth de la app con Supabase (email/password)**
Labels: `area:auth` · Milestone: `Fase 1 - Auth + esquema base`
Criterios:
- [ ] Registro y login con email/password vía Supabase Auth funcionando end-to-end.
- [ ] Sesión persistida y accesible en Server Components.
- [ ] Logout funcional.
- [ ] Explícitamente separado de la sesión PSN (la cuenta PSN es un dato vinculado, no el login).

**2. Migraciones de esquema base**
Labels: `area:db` · Milestone: `Fase 1 - Auth + esquema base`
Criterios:
- [ ] Migraciones para `users`, `psn_accounts`, `games`, `trophies`, `user_trophies`,
      `guides`, `guide_steps`, `user_guide_progress`, `ai_game_plans` (ver CLAUDE.md +
      PRODUCT_SPEC.md sección 6 para columnas exactas, incluyendo `games.cover_url`).
- [ ] Tipos generados con `generate_typescript_types` y commiteados.
- [ ] Nombres de columnas consistentes con lo documentado (no improvisar naming).

**3. RLS en todas las tablas de usuario**
Labels: `area:db`, `area:security` · Milestone: `Fase 1 - Auth + esquema base`
Criterios:
- [ ] RLS activado desde la misma migración que crea la tabla, no en una migración posterior.
- [ ] Políticas: un usuario solo lee/escribe sus propias filas en `psn_accounts`,
      `user_trophies`, `user_guide_progress`, y sus `ai_game_plans` cuando son user-scoped.
- [ ] Verificado con `get_advisors` de Supabase que no queden tablas sin RLS.

---

### Fase 2 — Conexión PSN + sync manual

**4. Pantalla para pegar NPSSO con instrucciones**
Labels: `area:psn`, `area:ui` · Milestone: `Fase 2 - Conexion PSN + sync manual`
Criterios:
- [ ] UI explica paso a paso cómo obtener el NPSSO (login en playstation.com, visitar
      `https://ca.account.sony.com/api/v1/ssocookie` en el mismo navegador).
- [ ] El input nunca se loguea ni aparece en el cliente después de enviarse.
- [ ] Feedback claro de éxito/error al vincular.

**5. `lib/psn/` — wrapper de autenticación y refresco de tokens**
Labels: `area:psn` · Milestone: `Fase 2 - Conexion PSN + sync manual`
Criterios:
- [ ] Todo uso de `psn-api` vive exclusivamente acá, ningún componente ni ruta suelta lo importa directo.
- [ ] NPSSO se cifra con `PSN_TOKEN_ENCRYPTION_KEY` antes de guardarse en `psn_accounts`.
- [ ] Manejo de refresh de tokens de sesión de `psn-api` (no solo el NPSSO inicial).

**6. Endpoint de sync manual de trofeos**
Labels: `area:psn` · Milestone: `Fase 2 - Conexion PSN + sync manual`
Criterios:
- [ ] Trae títulos + trofeos reales del usuario vía `psn-api` y los persiste en `games`,
      `trophies`, `user_trophies`.
- [ ] Guarda las URLs de íconos reales que devuelve la API (juego y trofeo), sin fallback a placeholder.
- [ ] Corre server-side vía API route, nunca desde el cliente.
- [ ] Respeta rate limits razonables (no se dispara en cada render).

**7. Manejo de NPSSO inválido o vencido**
Labels: `area:psn` · Milestone: `Fase 2 - Conexion PSN + sync manual`
Criterios:
- [ ] Sync fallido por token vencido no rompe la app ni deja estado inconsistente.
- [ ] Mensaje claro en la UI pidiendo reconectar con un NPSSO nuevo.
- [ ] Estado del token reflejado en `psn_accounts` (columna de estado).

---

### Fase 3 — Vista de perfil y biblioteca

**8. Biblioteca de juegos (cover + % completitud + conteo por tipo)**
Labels: `area:ui` · Milestone: `Fase 3 - Vista de perfil y biblioteca`
Criterios:
- [ ] Cada tarjeta usa el ícono real de PSN del juego (no genérico).
- [ ] Barra de progreso con % de completitud real calculado desde `user_trophies`.
- [ ] Conteo bronce/plata/oro/platino con sus íconos, no solo números.
- [ ] Server Component por defecto.

**9. Vista de detalle de juego (lista de trofeos)**
Labels: `area:ui` · Milestone: `Fase 3 - Vista de perfil y biblioteca`
Criterios:
- [ ] Lista completa de trofeos del juego con ícono real de cada trofeo.
- [ ] Distingue visualmente desbloqueado/no desbloqueado.
- [ ] Respeta el flag de trofeo oculto (no revela nombre/descripción si no está desbloqueado y es oculto).

**10. Vista de perfil con stats globales**
Labels: `area:ui` · Milestone: `Fase 3 - Vista de perfil y biblioteca`
Criterios:
- [ ] Nivel de trofeos, rareza y totales calculados desde datos ya sincronizados (no mockeados).
- [ ] Datos consistentes con lo que muestra la biblioteca.

---

### Fase 4 — Guías propias (CRUD)

**11. CRUD de guías (markdown) por juego**
Labels: `area:guides` · Milestone: `Fase 4 - Guias propias (CRUD)`
Criterios:
- [ ] Crear/editar/eliminar guías asociadas a un `game_id`.
- [ ] Contenido en markdown, renderizado de forma segura (sin XSS).
- [ ] El autor es el único editor en el MVP (no edición colaborativa).

**12. Pasos de guía opcionalmente ligados a un `trophy_id`**
Labels: `area:guides` · Milestone: `Fase 4 - Guias propias (CRUD)`
Criterios:
- [ ] Un paso de guía puede existir sin trofeo asociado, o ligarse a uno específico.
- [ ] Reordenamiento de pasos dentro de una guía.

**13. Checklist de pasos completados por el usuario**
Labels: `area:guides`, `area:ui` · Milestone: `Fase 4 - Guias propias (CRUD)`
Criterios:
- [ ] Usuario puede tildar/destildar pasos, persistido en `user_guide_progress`.
- [ ] Progreso es independiente de si el trofeo ya sincronizó (se puede tildar manualmente).

---

### Fase 5 — Checklist cruzada

**14. Cruzar `user_guide_progress` con `user_trophies`**
Labels: `area:guides` · Milestone: `Fase 5 - Checklist cruzada`
Criterios:
- [ ] Si un paso está ligado a un `trophy_id` y ese trofeo ya está desbloqueado, el paso
      se marca automáticamente como completado.
- [ ] No pisa un tilde manual previo del usuario si ya lo había marcado por otro motivo.

---

### Fase 6 — Advisor con IA

**15. `lib/ai/` — cliente, prompt y validación de schema**
Labels: `area:ai` · Milestone: `Fase 6 - Advisor con IA`
Criterios:
- [ ] Toda llamada al LLM vive acá, ningún componente/ruta suelta la importa directo.
- [ ] Input construido con nombre del juego, plataforma, lista de trofeos (nombre,
      descripción, tipo, oculto, ya obtenido) y guías propias existentes (ver PRODUCT_SPEC.md sección 4).
- [ ] Output validado contra el JSON schema de la sección 4 antes de aceptarlo; si es
      inválido, un reintento y luego se marca `status: error`.

**16. Endpoint "generar plan" por juego**
Labels: `area:ai` · Milestone: `Fase 6 - Advisor con IA`
Criterios:
- [ ] Server-side only, la API key del proveedor de IA nunca se expone al cliente.
- [ ] Acción explícita del usuario (botón), no se dispara automático en cada carga.

**17. UI del panel de advisor (resumen, missables, orden sugerido, tips)**
Labels: `area:ai`, `area:ui` · Milestone: `Fase 6 - Advisor con IA`
Criterios:
- [ ] Se etiqueta claramente como contenido generado por IA, con aviso de verificar contra guía oficial.
- [ ] Maneja el estado `status: error` mostrando "no se pudo generar", nunca un 500 silencioso.

**18. Cacheo en `ai_game_plans` + botón regenerar**
Labels: `area:ai` · Milestone: `Fase 6 - Advisor con IA`
Criterios:
- [ ] "Regenerar" crea una fila nueva versionada, no pisa la anterior.
- [ ] Plan no se regenera solo; se sirve desde caché mientras no se pida explícitamente.

---

### Fase 7 — Sync automático + expiración de token

**19. Cron de sync periódico (Vercel Cron o Supabase Edge Function)**
Labels: `area:psn`, `area:infra` · Milestone: `Fase 7 - Sync automatico + expiracion de token`
Criterios:
- [ ] Sync programado en background, no disparado por requests de usuario.
- [ ] Frecuencia razonable que respete rate limits no oficiales de PSN.
- [ ] Logs suficientes para diagnosticar fallos de sync sin exponer el NPSSO.

**20. Detección de NPSSO vencido + aviso de reconexión**
Labels: `area:psn`, `area:ui` · Milestone: `Fase 7 - Sync automatico + expiracion de token`
Criterios:
- [ ] El cron detecta fallo de auth y actualiza el estado en `psn_accounts`.
- [ ] Usuario ve aviso de reconexión la próxima vez que entra a la app.

---

### Fase 8 — Carátulas enriquecidas

**21. `lib/covers/` — resolución RAWG con fallback SteamGridDB**
Labels: `area:covers` · Milestone: `Fase 8 - Caratulas enriquecidas`
Criterios:
- [ ] Aislado en `lib/covers/`, mismo patrón que `lib/psn/` y `lib/ai/`.
- [ ] RAWG primero; si no hay match, fallback a SteamGridDB.
- [ ] API keys server-side (`RAWG_API_KEY`, `STEAMGRIDDB_API_KEY`), nunca `NEXT_PUBLIC_`.
- [ ] Si ninguna fuente tiene el juego, la UI cae al ícono de PSN sin romperse (nice-to-have, no bloqueante).

**22. Cacheo de `cover_url` en la tabla `games`**
Labels: `area:covers`, `area:db` · Milestone: `Fase 8 - Caratulas enriquecidas`
Criterios:
- [ ] Una vez resuelta, la URL se guarda en `games.cover_url` para no volver a pegarle a la API externa.
- [ ] Estrategia clara de cuándo re-resolver (ej. si quedó null, no en cada carga).

---

### Fase 9 — Enlaces a guías externas curadas

**23. Modelo + UI para links externos con atribución de fuente**
Labels: `area:guides`, `area:ui` · Milestone: `Fase 9 - Enlaces a guias externas curadas`
Criterios:
- [ ] Soporta enlaces a PowerPyx, PSNProfiles, TrueTrophies, IGN, YouTube (u otras) con nombre de fuente visible.
- [ ] Enlaces abren en `target="_blank" rel="noopener noreferrer"`.
- [ ] Nunca se copia ni scrapea el contenido de esos sitios, solo se linkea.

---

### Fase 10 — Pulido y deploy productivo

**24. Revisión de accesibilidad (contraste, foco de teclado)**
Labels: `area:ui` · Milestone: `Fase 10 - Pulido y deploy productivo`
Criterios:
- [ ] Contraste WCAG AA mínimo en el tema oscuro, especialmente en los 4 colores de trofeo sobre fondo oscuro.
- [ ] Navegación completa por teclado en flujos clave (login, conectar PSN, sync, guías).

**25. Manejo de estados vacíos/loading/error en toda la app**
Labels: `area:ui` · Milestone: `Fase 10 - Pulido y deploy productivo`
Criterios:
- [ ] Ninguna vista clave se queda en blanco sin feedback (biblioteca sin juegos, sync en curso, error de red).

**26. QA end-to-end del flujo completo**
Labels: `area:infra` · Milestone: `Fase 10 - Pulido y deploy productivo`
Criterios:
- [ ] Flujo probado manualmente: registro → conexión PSN → sync manual → ver biblioteca/trofeos
      reales → crear guía → generar plan de IA → checklist cruzada.
- [ ] Deploy productivo en Vercel funcionando con variables de entorno reales configuradas.

## 5. GitHub Project (v2)

1. Verificá si ya existe un Project llamado "Proyecto Platino - MVP" (`gh project list --owner YagoLopolito`).
   Si no existe, crealo: `gh project create --owner YagoLopolito --title "Proyecto Platino - MVP"`.
2. Agregá dos campos custom (chequeá la sintaxis exacta con `gh project field-create --help`,
   puede variar según versión de `gh`):
   - **Estado** (single select): `Backlog`, `To Do`, `In Progress`, `In Review`, `Done`.
   - **Prioridad** (single select): `P0`, `P1`, `P2`.
3. Agregá **todos** los issues del repo (los 4 existentes + los 26 nuevos) como items del
   Project (`gh project item-add`).
4. Seteá **Estado**: `Done` para issues ya cerrados, `Backlog` para el resto (o `To Do`
   para Fase 1, que es lo siguiente a trabajar).
5. Seteá **Prioridad**:
   - `P0`: Fases 0–3 (fundación, auth, sync PSN, tracker visible — el corazón del MVP).
   - `P1`: Fases 4–7 (guías, checklist cruzada, advisor IA, sync automático).
   - `P2`: Fases 8–9 (carátulas enriquecidas, enlaces externos).
   - Fase 10 (pulido/QA): `P1`, va al final del trabajo pero no es opcional.
6. Si `gh project` falla por falta de scope, corré `gh auth refresh -s project` y reintentá.

## 6. Actualizar `github-setup.sh`

Dejalo reflejando la realidad para que sea reproducible a futuro:
- Reemplazá `OWNER="TU-USUARIO-GITHUB"` por `OWNER="YagoLopolito"`.
- Agregá chequeos de idempotencia (no asumir que el repo no existe; usar `gh repo view`
  antes de `gh repo create`, comparar issues existentes por título antes de crear).
- Sumá la creación de los dos campos custom del Project (Estado, Prioridad) y el
  `item-add` de todos los issues, para que quede todo en un solo script re-corrible.

## 7. Reporte final

Al terminar, mostrame un resumen en texto plano: cuántos labels/milestones/issues se
crearon vs. ya existían, el link al Project, y cualquier paso que no pudiste automatizar
(por ejemplo si `gh project` no tiene el scope necesario y hace falta que yo lo autorice
manualmente).
