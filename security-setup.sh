#!/usr/bin/env bash
# Proyecto Platino — Fase 12: Endurecimiento de seguridad.
# Crea labels, milestone e issues en GitHub para los 10 hallazgos de la
# auditoría manual de seguridad sobre main @ e1b2105 (23-ago-2026).
#
# Mismo patrón que github-setup.sh: idempotente, se puede re-correr entero
# sin duplicar labels, milestone, issues ni items del Project.
#
# Requiere: gh CLI instalado y autenticado, parado en la carpeta local del
# repo (E:\Projecto platino).
set -euo pipefail

OWNER="YagoLopolito"
REPO="proyecto-platino"
FULL="$OWNER/$REPO"

DOD='## Definition of Done
- [ ] Pasa lint/typecheck sin `any` fuera de boundaries documentados.
- [ ] No hay llamadas a `psn-api` fuera de `lib/psn/`, al LLM fuera de `lib/ai/`, ni a
      APIs de covers fuera de `lib/covers/`.
- [ ] Tablas nuevas o alteradas con datos de usuario tienen RLS revisada.
- [ ] Al menos un estado de error manejado explícitamente en la UI.
- [ ] Probado manualmente en local (con datos reales de PSN si el issue toca el sync).'

# Reglas de no-romper (sección 2 del prompt de la fase), inyectadas en las
# Notas técnicas de cada issue que sí implica código.
SECURITY_RULES='### Reglas de no-romper de la Fase 12
- Una rama por issue, `security/<slug>`, salida de `main` actualizado. Nada de ramas
  acumulativas ni de "ya que estoy" tocando otros issues.
- Verificación obligatoria antes de abrir el PR, en este orden: `npx tsc --noEmit` limpio,
  `npx eslint .` limpio sobre los archivos tocados, `npm run build` completo sin error, y
  el smoke test de sesión (`npm run dev` + `curl` confirmando que `/juegos`, `/psn` y
  `/perfil` siguen devolviendo 307 sin sesión, y que `/login`/`/registro` devuelven 200).
  Después, el smoke test funcional específico del issue.
- Prohibido en esta fase: dependencias nuevas sin declararlas en el issue, subir
  versiones de paquetes, tocar archivos fuera del alcance declarado, y tocar cualquier
  cosa bajo `.claude/worktrees/`.
- Migraciones: archivo propio con timestamp nuevo, bloque `-- ROLLBACK` comentado con el
  SQL exacto para revertir, probada primero en un branch de Supabase (MCP: create_branch →
  apply_migration → verificar → merge_branch). Nunca `apply_migration` directo contra
  producción. Si cambia el esquema, regenerar `lib/supabase/database.types.ts` y
  commitearlo en el mismo PR.
- Si el issue tiene código + migración, el orden de deploy es: primero el código (que
  tolera los dos estados), después la migración. Invertirlo puede romper el sync de PSN.
- No tocar el formato del ciphertext del NPSSO (`iv.authTag.ciphertext` en base64) fuera
  del Issue 11.
- No convertir `get_library_trophy_stats()` a `security definer`, ni por "que ande" ni por
  performance: es `security invoker` a propósito.
- Si un issue no se puede completar sin romper algo, se deja el PR en draft con una nota
  del conflicto y se sigue con el siguiente. No se fuerza.'

echo "== 0. Repo =="
gh repo view "$FULL" >/dev/null

echo "== 1. Labels =="
create_label () {
  gh label create "$1" --repo "$FULL" --description "$2" --color "$3" --force
}
create_label "security:manual"  "Checklist manual, sin cambio de código" "b60205"
create_label "security:blocked" "Bloqueado hasta cerrar otros issues"    "000000"

echo "== 2. Milestone =="
MILESTONE_TITLE="Fase 12 - Endurecimiento de seguridad"
existing_milestones="$(gh api "repos/$FULL/milestones" --paginate -q '.[].title' 2>/dev/null || true)"
if grep -qxF "$MILESTONE_TITLE" <<< "$existing_milestones"; then
  echo "  '$MILESTONE_TITLE' ya existe, se omite."
else
  gh api "repos/$FULL/milestones" -f title="$MILESTONE_TITLE" -f state="open" >/dev/null
  echo "  creado: $MILESTONE_TITLE"
fi
M="$MILESTONE_TITLE"

echo "== 3. Issues =="
existing_issues="$(gh issue list --repo "$FULL" --state all --limit 300 --json title -q '.[].title' 2>/dev/null || true)"

create_issue () {
  local title="$1" labels="$2" contexto="$3" criterios="$4" notas="$5" incluir_reglas="${6:-si}"
  if grep -qxF "$title" <<< "$existing_issues"; then
    echo "  '$title' ya existe, se omite."
    issue_number_by_title["$title"]="$(gh issue list --repo "$FULL" --state all --search "in:title \"$title\"" --json number,title -q ".[] | select(.title==\"$title\") | .number" | head -n1)"
    return
  fi
  local body notas_final
  if [ "$incluir_reglas" = "si" ]; then
    notas_final="${notas}

${SECURITY_RULES}"
  else
    notas_final="${notas}"
  fi
  body="## Contexto
${contexto}

## Criterios de aceptación
${criterios}

## Notas técnicas
${notas_final}

${DOD}"
  local url
  url="$(gh issue create --repo "$FULL" --title "$title" --body "$body" \
    --milestone "$M" --label "$labels")"
  echo "  creado: $title ($url)"
  existing_issues="$existing_issues
$title"
  issue_number_by_title["$title"]="${url##*/}"
}

declare -A issue_number_by_title

# --- Issue 1 ---
create_issue "P0: Sacar el [DEBUG] que filtra errores de auth en producción" \
  "area:auth,area:security" \
  "\`app/login/actions.ts:20\` devuelve al navegador el mensaje crudo de Supabase
(\`error.name\`, \`error.message\`, \`error.status\`). Permite enumerar cuentas:
\"Invalid login credentials\" vs \"Email not confirmed\" vs rate limit son respuestas
distintas. El comentario del propio código pide revertirlo." \
  "- [ ] Cualquier fallo de login devuelve el mismo texto: \"Email o contraseña incorrectos.\"
- [ ] El error real va a \`console.error\` (queda en logs de Vercel, no en pantalla)
- [ ] El comentario \`DEBUG TEMPORAL\` se elimina del código
- [ ] Se revisa \`app/registro/actions.ts\` y \`app/(app)/psn/actions.ts\` con el mismo
      criterio: ningún mensaje de proveedor externo llega crudo al cliente" \
  "Cambio de ~4 líneas, sin migración. Smoke test: intentar login con email inexistente y
con contraseña incorrecta → mismo mensaje exacto en los dos casos."

# --- Issue 2 ---
create_issue "P1: Validar gameId/gameName antes de que escriba el service role (enlaces externos)" \
  "area:security,area:guides" \
  "\`findExternalGuides\` (\`app/(app)/juegos/[id]/enlaces/actions.ts\`) toma \`gameId\` y
\`gameName\` del FormData sin validar y se los pasa a \`populateExternalGuidesForGame\`,
que escribe con service role (bypassea RLS). Un usuario logueado puede insertar filas con
título arbitrario en cualquier \`game_id\` —contenido que ven todos los usuarios— y quemar
la cuota de la Steam Web API." \
  "- [ ] El nombre del juego se lee de la tabla \`games\`, nunca del formulario
- [ ] Se verifica que el \`gameId\` existe y que está en \`user_games\` del usuario que
      dispara la acción; si no, error claro y no se escribe nada
- [ ] \`populateExternalGuidesForGame\` sigue recibiendo sólo datos ya validados
- [ ] La UI de \`/juegos/[id]/enlaces\` sigue funcionando igual para el caso feliz" \
  "Patrón sugerido:
\`\`\`ts
const { data: game } = await supabase
  .from(\"games\").select(\"id, name\").eq(\"id\", gameId).single();
if (!game) return { inserted: null, errors: [\"No se encontró el juego.\"] };
const { data: owned } = await supabase
  .from(\"user_games\").select(\"game_id\")
  .eq(\"user_id\", user.id).eq(\"game_id\", gameId).maybeSingle();
if (!owned) return { inserted: null, errors: [\"Ese juego no está en tu biblioteca.\"] };
const result = await populateExternalGuidesForGame(game.id, game.name);
\`\`\`
Smoke test: usuario con el juego en biblioteca → funciona; request con un \`gameId\` ajeno
→ rechazado sin escribir."

# --- Issue 3 ---
create_issue "P1: Freno de frecuencia en el sync manual y las acciones caras" \
  "area:psn,area:security" \
  "\`/api/psn/sync\` acepta POSTs ilimitados. Llamadas repetidas generan cientos de
requests a la API interna de Sony desde IPs de Vercel — el patrón exacto por el que Sony
bloquea IPs o invalida tokens. CLAUDE.md ya dice \"no hacer polling agresivo\". Mismo
problema en \`generateAiPlan\` (cuota de Groq)." \
  "- [ ] \`/api/psn/sync\` rechaza con 429 si \`psn_accounts.last_synced_at\` tiene menos de
      10 minutos, con un mensaje que diga cuánto falta
- [ ] El \`SyncButton\` muestra ese mensaje en vez del error genérico, y el botón queda
      deshabilitado mientras el cooldown esté activo
- [ ] El cron (\`/api/cron/sync\`) NO queda sujeto a ese límite — corre una vez por día y
      tiene que poder sincronizar aunque un usuario haya sincronizado a mano
- [ ] \`generateAiPlan\` tiene un límite propio (sugerido: 1 plan por juego cada 5 min por
      usuario, mirando \`ai_game_plans.created_at\`)" \
  "Sin dependencias nuevas — \`last_synced_at\` y \`ai_game_plans.created_at\` ya existen.
Nada de Redis en este issue; un rate limit por IP para el login, si hiciera falta, va como
issue separado. **El cron tiene que quedar exento del cooldown**: si le aplicás el mismo
límite de 10 minutos, un usuario que sincronizó a mano a la mañana no se sincroniza esa
noche. Smoke test: dos syncs manuales seguidos → el segundo devuelve 429; forzar el cron
con \`CRON_SECRET\` → sincroniza igual."

# --- Issue 4 ---
create_issue "P1: Cerrar las 6 políticas RLS abiertas al rol anon" \
  "area:db,area:security" \
  "6 políticas usan \`using (true)\` sin \`to authenticated\` (\`games\`, \`trophies\`,
\`trophy_groups\`, \`guides\`, \`guide_steps\`, \`game_external_guides\`). En Postgres eso
es PUBLIC, o sea que aplica también al rol \`anon\` — y la anon key viaja en el bundle
público. Cualquiera puede bajarse esas tablas enteras sin cuenta, incluyendo los UUID de
usuarios en \`created_by\`/\`author_id\`." \
  "- [ ] Migración nueva que hace \`drop policy\` + \`create policy ... for select to
      authenticated using (true)\` para las 6 tablas
- [ ] \`ai_game_plans\` NO se toca (ya usa \`user_id is null or auth.uid() = user_id\`)
- [ ] Bloque \`-- ROLLBACK\` con el SQL para volver al estado anterior
- [ ] Probada en un branch de Supabase antes de mergear
- [ ] Verificado post-migración: con la anon key y sin sesión, un \`GET\` a
      \`/rest/v1/games\` devuelve \`[]\` o 401; con sesión, la app sigue funcionando igual" \
  "Ya está verificado que ninguna ruta pública lee estas tablas (\`app/page.tsx\` sólo hace
redirect; login/registro/auth/confirm no leen ninguna tabla), así que el riesgo de romper
el render es nulo. Smoke test completo de la app logueada: \`/juegos\`, ficha de juego,
\`/juegos/[id]/guias\`, \`/juegos/[id]/enlaces\`, \`/perfil\`."

# --- Issue 5 ---
create_issue "P1: Revocar npsso_encrypted del rol authenticated y mover la lectura al service client" \
  "area:security,area:psn" \
  "\`psn_accounts_select_own\` permite leer la fila entera, columna \`npsso_encrypted\`
incluida, desde el navegador con la anon key. Es el ciphertext propio y sin la llave no
vale nada, pero no hay razón para que sea accesible: un XSS futuro o una extensión
maliciosa tendría algo que llevarse." \
  "- [ ] \`syncTrophiesForUser\` lee \`npsso_encrypted\` con \`createServiceClient()\`,
      validando el \`userId\` recibido antes de la query, y sigue haciendo el resto de las
      escrituras con el cliente que recibe por parámetro
- [ ] Migración con \`revoke select (npsso_encrypted) on public.psn_accounts from
      authenticated, anon;\`
- [ ] Bloque \`-- ROLLBACK\` con el \`grant\` correspondiente
- [ ] El sync manual (\`/api/psn/sync\`) y el cron (\`/api/cron/sync\`) siguen andando los
      dos, verificado contra la cuenta PSN real
- [ ] \`/psn\` sigue mostrando \`online_id\`, \`token_status\` y \`last_synced_at\`" \
  "**Este es el issue más delicado de la fase.** El sync manual hoy corre con la sesión del
usuario (rol authenticated); si se revoca la columna sin cambiar el código antes, el sync
se rompe para todos. Orden obligatorio: (1) mergear y desplegar el cambio de código, que
funciona con y sin el grant; (2) recién ahí aplicar la migración. No juntar en un solo
deploy. Beneficio lateral: desacopla el sync de las RLS del catálogo compartido (la
\"limitación v1\" anotada en CLAUDE.md)."

# --- Issue 6 ---
create_issue "P2: Cabeceras de seguridad en next.config.ts" \
  "area:infra,area:security" \
  "No hay CSP, HSTS, X-Frame-Options ni Referrer-Policy. La superficie de XSS hoy es chica
(React escapa todo, no hay \`dangerouslySetInnerHTML\`), pero cabeceras básicas son lo que
impide que un XSS futuro haga cosas como clickjacking o filtre el referrer." \
  "- [ ] Bloque \`async headers()\` en \`next.config.ts\` aplicado a todas las rutas con:
      \`Referrer-Policy: strict-origin-when-cross-origin\`, \`X-Frame-Options: DENY\`,
      \`X-Content-Type-Options: nosniff\`, \`Strict-Transport-Security: max-age=63072000;
      includeSubDomains; preload\`, \`Permissions-Policy\` restrictiva
- [ ] Verificado con \`curl -I\` contra el dev server y contra el preview de Vercel
- [ ] Las imágenes de \`next/image\` siguen cargando desde los hosts de \`remotePatterns\`
      (PSN, RAWG, SteamGridDB)" \
  "La CSP queda fuera de este issue a propósito — Next necesita \`'unsafe-inline'\` en
styles salvo que se implementen nonces, y hacerla mal rompe la app entera. Abrir un issue
de seguimiento \"CSP con nonces\" en el backlog (sin bloquear esta fase)."

# --- Issue 7 ---
create_issue "P2: Filtrar las guías por autor antes de mandarlas al prompt de la IA" \
  "area:ai,area:security" \
  "\`generateAiPlan\` trae todas las guías del juego sin filtrar por autor y las manda a
Groq. Como cualquier usuario puede escribir una guía en cualquier juego, alguien puede
redactar una con instrucciones dirigidas al modelo y contaminar el plan que ve otro
usuario. No hay exfiltración posible (el modelo no tiene herramientas), pero sí contenido
engañoso con apariencia de venir de la app." \
  "- [ ] La query de \`guides\` en \`ai-actions.ts\` filtra por \`author_id = user.id\`
- [ ] \`lib/ai/prompt.ts\` delimita el bloque de guías con marcadores explícitos y el
      system prompt aclara que ese contenido es dato del usuario, nunca instrucción
- [ ] Un plan generado para un juego sin guías propias sigue saliendo bien" \
  "Las dos medidas son complementarias, hacer las dos. Sin migración."

# --- Issue 8 ---
create_issue "P2: timingSafeEqual en el chequeo del CRON_SECRET" \
  "area:infra,area:security" \
  "\`app/api/cron/sync/route.ts:24\` compara el secreto con \`===\`, que corta en el
primer byte distinto. Sobre internet es impracticable, pero el arreglo cuesta tres líneas
y la respuesta del endpoint hoy expone la lista de UUIDs de todos los usuarios." \
  "- [ ] Comparación con \`crypto.timingSafeEqual\` sobre buffers, chequeando el largo
      primero para que no tire excepción
- [ ] Sin \`CRON_SECRET\` seteada, el endpoint sigue devolviendo 401 a todo
- [ ] El cron real de Vercel sigue autenticándose bien
- [ ] Recortar la respuesta: devolver conteos y errores, sin los \`userId\`" \
  "Sin migración. Smoke test: \`curl\` con el secreto correcto → 200; con uno incorrecto
del mismo largo → 401."

# --- Issue 9 (manual) ---
create_issue "P0 [Manual]: Endurecer las cuentas de los proveedores" \
  "area:infra,area:security,security:manual" \
  "\`PSN_TOKEN_ENCRYPTION_KEY\` y \`SUPABASE_SERVICE_ROLE_KEY\` viven las dos en el mismo
proyecto de Vercel. Ninguna sola alcanza para nada, pero juntas descifran todos los NPSSO
de todos los usuarios. Quien entre a la cuenta de Vercel se lleva las dos: hoy es el único
punto de falla real del sistema." \
  "- [ ] 2FA activado en Vercel
- [ ] 2FA activado en GitHub
- [ ] 2FA activado en Supabase
- [ ] Revisar quién más tiene acceso a los tres proyectos y sacar lo que sobre
- [ ] Confirmar que \`CRON_SECRET\` está seteada en el proyecto de Vercel (sin ella el
      cron está silenciosamente deshabilitado desde siempre)
- [ ] Anotar en un lugar seguro cómo rotar \`PSN_TOKEN_ENCRYPTION_KEY\` si hiciera falta
      (hoy no hay procedimiento escrito)" \
  "No requiere código, no lleva rama ni PR — se cierra a mano. Diez minutos, cubre el
escenario del peor día." \
  no

# --- Issue 10 (manual) ---
create_issue "P2 [Manual]: Activar MFA y contraseñas filtradas en Supabase Auth" \
  "area:auth,area:security,security:manual" \
  "La única validación de contraseña es \`length >= 8\` en \`app/registro/actions.ts\`.
Quien entre a la cuenta de Proyecto Platino de alguien no puede sacar su NPSSO en claro,
pero ve su perfil completo y puede disparar syncs." \
  "- [ ] Activar \"Leaked password protection\" (HaveIBeenPwned) en el dashboard de Supabase
- [ ] Activar MFA por TOTP en Supabase Auth
- [ ] Correr \`get_advisors\` del MCP de Supabase (security + performance) y anotar en el
      issue qué devuelve
- [ ] Si se activa MFA, abrir un issue de seguimiento para la UI de enrolamiento (fuera
      del alcance de esta fase)" \
  "Las dos primeras son switches del dashboard, sin código. No lleva rama ni PR." \
  no

echo "== 4. Issue 11 (bloqueado, con dependencias reales) =="
TITLE11="P2 [BLOQUEADO]: AAD por usuario en el cifrado del NPSSO + re-cifrado de secretos guardados"
if grep -qxF "$TITLE11" <<< "$existing_issues"; then
  echo "  '$TITLE11' ya existe, se omite."
else
  deps=""
  for t in \
    "P0: Sacar el [DEBUG] que filtra errores de auth en producción" \
    "P1: Validar gameId/gameName antes de que escriba el service role (enlaces externos)" \
    "P1: Freno de frecuencia en el sync manual y las acciones caras" \
    "P1: Cerrar las 6 políticas RLS abiertas al rol anon" \
    "P1: Revocar npsso_encrypted del rol authenticated y mover la lectura al service client" \
    "P2: Cabeceras de seguridad en next.config.ts" \
    "P2: Filtrar las guías por autor antes de mandarlas al prompt de la IA" \
    "P2: timingSafeEqual en el chequeo del CRON_SECRET" \
    "P0 [Manual]: Endurecer las cuentas de los proveedores" \
    "P2 [Manual]: Activar MFA y contraseñas filtradas en Supabase Auth"; do
    n="${issue_number_by_title[$t]:-}"
    if [ -n "$n" ]; then
      deps="${deps}#${n}, "
    fi
  done
  deps="${deps%, }"

  contexto11="\`encryptSecret\`/\`decryptSecret\` (AES-256-GCM, IV aleatorio, authTag
verificado) están bien implementados, pero no atan el ciphertext a su dueño. Quien logre
escribir en \`psn_accounts\` puede mover el ciphertext de un usuario a la fila de otro y
hacer que el sync lo descifre y lo use. Es defensa en profundidad, no una vulnerabilidad
explotable hoy.

**Bloqueado por: ${deps}** — no empezar hasta que estén cerrados y desplegados."

  criterios11="- [ ] \`encryptSecret(plaintext, userId)\` y \`decryptSecret(encoded, userId)\`
      usan \`cipher.setAAD(Buffer.from(userId, \"utf8\"))\`
- [ ] Formato del ciphertext versionado (p. ej. prefijo \`v2.\`) para distinguir filas
      migradas de las viejas
- [ ] \`decryptSecret\` acepta los dos formatos durante la transición
- [ ] Script de migración de datos, idempotente y con dry-run, que descifra con el código
      viejo y vuelve a cifrar con AAD, fila por fila
- [ ] Probado contra la cuenta PSN real: sync manual y cron andan después de migrar
- [ ] Recién cuando no queden filas v1, se elimina el camino de compatibilidad"

  notas11="Este issue puede dejar usuarios sin poder sincronizar si sale mal. Por eso va
último y bloqueado. Requisitos previos: **backup de \`psn_accounts\` antes de correr la
migración de datos**, y un plan de recuperación escrito (en el peor caso, poner
\`token_status = 'expired'\` para que la UI le pida a cada usuario reconectar con un NPSSO
nuevo — se pierde comodidad, no datos).

${SECURITY_RULES}"

  body11="## Contexto
${contexto11}

## Criterios de aceptación
${criterios11}

## Notas técnicas
${notas11}

${DOD}"
  url="$(gh issue create --repo "$FULL" --title "$TITLE11" --body "$body11" \
    --milestone "$M" --label "area:security,area:psn,security:blocked")"
  echo "  creado: $TITLE11 ($url)"
  existing_issues="$existing_issues
$TITLE11"
  issue_number_by_title["$TITLE11"]="${url##*/}"
fi

echo "== 5. GitHub Project (v2): agregar issues con prioridad =="
PROJECT_TITLE="Proyecto Platino - MVP"
project_number="$(gh project list --owner "$OWNER" --format json -q ".projects[] | select(.title==\"$PROJECT_TITLE\") | .number" 2>/dev/null | head -n1 || true)"
if [ -z "${project_number:-}" ]; then
  echo "  Project '$PROJECT_TITLE' no encontrado, se omite el paso 5."
else
  echo "  Project #$project_number encontrado."
  fields_json="$(gh project field-list "$project_number" --owner "$OWNER" --format json)"
  prioridad_field_id="$(echo "$fields_json" | grep -o '"id":"[^"]*"[^}]*"name":"Prioridad"' | grep -o '^"id":"[^"]*"' | cut -d'"' -f4 || true)"

  declare -A PRIORIDAD=(
    ["P0: Sacar el [DEBUG] que filtra errores de auth en producción"]="P0"
    ["P1: Validar gameId/gameName antes de que escriba el service role (enlaces externos)"]="P1"
    ["P1: Freno de frecuencia en el sync manual y las acciones caras"]="P1"
    ["P1: Cerrar las 6 políticas RLS abiertas al rol anon"]="P1"
    ["P1: Revocar npsso_encrypted del rol authenticated y mover la lectura al service client"]="P1"
    ["P2: Cabeceras de seguridad en next.config.ts"]="P2"
    ["P2: Filtrar las guías por autor antes de mandarlas al prompt de la IA"]="P2"
    ["P2: timingSafeEqual en el chequeo del CRON_SECRET"]="P2"
    ["P0 [Manual]: Endurecer las cuentas de los proveedores"]="P0"
    ["P2 [Manual]: Activar MFA y contraseñas filtradas en Supabase Auth"]="P2"
    ["$TITLE11"]="P2"
  )

  for title in "${!issue_number_by_title[@]}"; do
    n="${issue_number_by_title[$title]}"
    [ -z "$n" ] && continue
    item_id="$(gh project item-add "$project_number" --owner "$OWNER" \
      --url "https://github.com/$FULL/issues/$n" --format json -q '.id' 2>/dev/null || true)"
    echo "  #$n agregado al Project (prioridad sugerida: ${PRIORIDAD[$title]:-?})."
  done
  echo "  Nota: los valores del campo Prioridad por item se setean a mano con"
  echo "  'gh project item-edit' (mismo criterio que dejó github-setup.sh en Fases 0-11)."
fi

echo "== Listo =="
echo "Issues creados/verificados:"
for title in "${!issue_number_by_title[@]}"; do
  echo "  #${issue_number_by_title[$title]} - $title"
done
