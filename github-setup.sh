#!/usr/bin/env bash
# Proyecto Platino — setup de repo, labels, milestones, issues y Project (v2) en GitHub.
# Requiere: gh CLI instalado y autenticado (`gh auth login`), y correr esto
# parado en la carpeta local del proyecto (E:\Projecto platino).
#
# Idempotente: se puede re-correr completo sin duplicar labels, milestones,
# issues ni items del Project.
set -euo pipefail

OWNER="YagoLopolito"
REPO="proyecto-platino"
VISIBILITY="private"        # private | public
FULL="$OWNER/$REPO"

DOD='## Definition of Done
- [ ] Pasa lint/typecheck sin `any` fuera de boundaries documentados.
- [ ] No hay llamadas a `psn-api` fuera de `lib/psn/`, al LLM fuera de `lib/ai/`, ni a
      APIs de covers fuera de `lib/covers/`.
- [ ] Tablas nuevas con datos de usuario tienen RLS.
- [ ] Al menos un estado de error manejado explícitamente en la UI.
- [ ] Probado manualmente en local (con datos reales de PSN si la fase ya sincroniza).'

echo "== 1. Repo $FULL ($VISIBILITY) =="
if gh repo view "$FULL" >/dev/null 2>&1; then
  echo "  ya existe, se omite creación."
else
  gh repo create "$FULL" --"$VISIBILITY" --source=. --remote=origin --push
fi

echo "== 2. Labels =="
create_label () {
  gh label create "$1" --repo "$FULL" --description "$2" --color "$3" --force
}
create_label "area:infra"    "Infra, tooling, deploy"      "5319e7"
create_label "area:auth"     "Auth y sesiones"             "1d76db"
create_label "area:db"       "Modelo de datos / Supabase"  "0e8a16"
create_label "area:security" "Seguridad / RLS / secretos"  "d73a4a"
create_label "area:psn"      "Integracion PSN (psn-api)"   "006b75"
create_label "area:ai"       "Advisor con IA"              "fbca04"
create_label "area:guides"   "Guias y checklist"           "c5def5"
create_label "area:covers"   "Caratulas / imagenes"        "f9d0c4"
create_label "area:ui"       "Frontend / UI"               "bfd4f2"

echo "== 3. Milestones =="
existing_milestones="$(gh api "repos/$FULL/milestones" --paginate -q '.[].title' 2>/dev/null || true)"
milestones=(
  "Fase 0 - Setup del repo"
  "Fase 1 - Auth + esquema base"
  "Fase 2 - Conexion PSN + sync manual"
  "Fase 3 - Vista de perfil y biblioteca"
  "Fase 4 - Guias propias (CRUD)"
  "Fase 5 - Checklist cruzada"
  "Fase 6 - Advisor con IA"
  "Fase 7 - Sync automatico + expiracion de token"
  "Fase 8 - Caratulas enriquecidas"
  "Fase 9 - Enlaces a guias externas curadas"
  "Fase 10 - Pulido y deploy productivo"
)
for m in "${milestones[@]}"; do
  if grep -qxF "$m" <<< "$existing_milestones"; then
    echo "  '$m' ya existe, se omite."
  else
    gh api "repos/$FULL/milestones" -f title="$m" -f state="open" >/dev/null
    echo "  creado: $m"
  fi
done

echo "== 4. Issues =="
existing_issues="$(gh issue list --repo "$FULL" --state all --limit 200 --json title -q '.[].title' 2>/dev/null || true)"

create_issue () {
  local title="$1" milestone="$2" labels="$3" contexto="$4" criterios="$5" notas="$6"
  if grep -qxF "$title" <<< "$existing_issues"; then
    echo "  '$title' ya existe, se omite."
    return
  fi
  local body
  body="## Contexto
${contexto}

## Criterios de aceptación
${criterios}

## Notas técnicas
${notas}

${DOD}"
  gh issue create --repo "$FULL" --title "$title" --body "$body" \
    --milestone "$milestone" --label "$labels" >/dev/null
  echo "  creado: $title"
  existing_issues="$existing_issues
$title"
}

# --- Fase 0 ---
M="Fase 0 - Setup del repo"
create_issue "Scaffolding Next.js (App Router) + TypeScript + Tailwind" "$M" "area:infra" \
  "Base técnica del proyecto según CLAUDE.md (stack: Next.js App Router + TS + Tailwind)." \
  "- [ ] Proyecto Next.js con App Router y TypeScript estricto
- [ ] Tailwind CSS configurado y funcional
- [ ] Estructura de carpetas inicial (app/, lib/, components/)" \
  "N/A"
create_issue "Configurar ESLint/Prettier y reglas de convenciones" "$M" "area:infra" \
  "Convenciones de código de CLAUDE.md (sin 'any' salvo boundaries externos)." \
  "- [ ] ESLint configurado con regla no-explicit-any (con excepciones documentadas)
- [ ] Prettier configurado y aplicado
- [ ] Scripts lint/format en package.json" \
  "N/A"
create_issue "Configurar proyecto Supabase (cloud) + .env.example" "$M" "area:infra" \
  "Sección 'Variables de entorno esperadas' de CLAUDE.md." \
  "- [ ] Proyecto Supabase creado en la nube
- [ ] .env.example con NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PSN_TOKEN_ENCRYPTION_KEY
- [ ] Ninguna clave sensible commiteada" \
  "N/A"
create_issue "Configurar deploy inicial en Vercel" "$M" "area:infra" \
  "Sección 'Deploy' de CLAUDE.md (Vercel para Next.js)." \
  "- [ ] Repo conectado a Vercel
- [ ] Env vars cargadas en Vercel
- [ ] Deploy de preview funcional" \
  "N/A"

# --- Fase 1 ---
M="Fase 1 - Auth + esquema base"
create_issue "Auth de la app con Supabase (email/password)" "$M" "area:auth" \
  "Auth propia de la app, separada de la sesión PSN (CLAUDE.md sección 'Stack técnico')." \
  "- [ ] Registro/login end-to-end vía Supabase Auth
- [ ] Sesión persistida y accesible en Server Components
- [ ] Logout funcional
- [ ] Explícitamente separado de la sesión PSN (PSN es dato vinculado, no login)" \
  "N/A"
create_issue "Migraciones de esquema base" "$M" "area:db" \
  "Modelo de datos (borrador) de CLAUDE.md y PRODUCT_SPEC.md sección 6." \
  "- [ ] Migraciones para users, psn_accounts, games, trophies, user_trophies, guides, guide_steps, user_guide_progress, ai_game_plans
- [ ] Columnas según CLAUDE.md + PRODUCT_SPEC.md sección 6, incluyendo games.cover_url
- [ ] Tipos generados con generate_typescript_types y commiteados
- [ ] Naming consistente" \
  "N/A"
create_issue "RLS en todas las tablas de usuario" "$M" "area:db,area:security" \
  "Seguridad de datos por usuario (CLAUDE.md 'Convenciones de código')." \
  "- [ ] RLS activado desde la misma migración que crea la tabla
- [ ] Políticas para psn_accounts, user_trophies, user_guide_progress, ai_game_plans user-scoped
- [ ] Verificado con get_advisors de Supabase" \
  "N/A"

# --- Fase 2 ---
M="Fase 2 - Conexion PSN + sync manual"
create_issue "Pantalla para pegar NPSSO con instrucciones" "$M" "area:psn,area:ui" \
  "Flujo de autenticación PSN vía NPSSO (CLAUDE.md sección 'PSN API')." \
  "- [ ] UI explica cómo obtener NPSSO (login playstation.com, visitar https://ca.account.sony.com/api/v1/ssocookie)
- [ ] Input nunca se loguea ni aparece en cliente después de enviarse
- [ ] Feedback claro de éxito/error" \
  "N/A"
create_issue "lib/psn/ - wrapper de autenticación y refresco de tokens" "$M" "area:psn" \
  "Aislamiento de la API no oficial de PSN (CLAUDE.md sección 'PSN API')." \
  "- [ ] Todo uso de psn-api vive exclusivamente en lib/psn/
- [ ] NPSSO cifrado con PSN_TOKEN_ENCRYPTION_KEY antes de guardarse
- [ ] Manejo de refresh de tokens de sesión (no solo NPSSO inicial)" \
  "N/A"
create_issue "Endpoint de sync manual de trofeos" "$M" "area:psn" \
  "Sync de trofeos reales del usuario (CLAUDE.md sección 'Roadmap sugerido' paso 2)." \
  "- [ ] Trae títulos+trofeos reales vía psn-api y persiste en games/trophies/user_trophies
- [ ] Guarda URLs de íconos reales sin fallback a placeholder
- [ ] Corre server-side vía API route
- [ ] Respeta rate limits" \
  "N/A"
create_issue "Manejo de NPSSO inválido o vencido" "$M" "area:psn" \
  "Expiración de NPSSO (CLAUDE.md sección 'PSN API')." \
  "- [ ] Sync fallido no rompe la app ni deja estado inconsistente
- [ ] Mensaje claro pidiendo reconectar
- [ ] Estado del token reflejado en psn_accounts" \
  "N/A"

# --- Fase 3 ---
M="Fase 3 - Vista de perfil y biblioteca"
create_issue "Biblioteca de juegos (cover + % completitud + conteo por tipo)" "$M" "area:ui" \
  "Trophy tracker (CLAUDE.md 'Visión del producto' pilar 1)." \
  "- [ ] Ícono real de PSN por tarjeta
- [ ] Barra de progreso con % real desde user_trophies
- [ ] Conteo bronce/plata/oro/platino con íconos
- [ ] Server Component por defecto" \
  "N/A"
create_issue "Vista de detalle de juego (lista de trofeos)" "$M" "area:ui" \
  "Trophy tracker (CLAUDE.md 'Visión del producto' pilar 1)." \
  "- [ ] Lista completa con ícono real de cada trofeo
- [ ] Distingue visualmente desbloqueado/no
- [ ] Respeta flag de oculto (no revela nombre/descripción si oculto y no desbloqueado)" \
  "N/A"
create_issue "Vista de perfil con stats globales" "$M" "area:ui" \
  "Estadísticas globales (CLAUDE.md 'Visión del producto' pilar 1)." \
  "- [ ] Nivel de trofeos, rareza y totales calculados desde datos sincronizados (no mockeados)
- [ ] Consistente con biblioteca" \
  "N/A"

# --- Fase 4 ---
M="Fase 4 - Guias propias (CRUD)"
create_issue "CRUD de guías (markdown) por juego" "$M" "area:guides" \
  "Guía organizador, curación propia (CLAUDE.md 'Guías de desbloqueo: enfoque' punto 1)." \
  "- [ ] Crear/editar/eliminar guías asociadas a game_id
- [ ] Markdown renderizado seguro (sin XSS)
- [ ] Autor único editor en MVP" \
  "N/A"
create_issue "Pasos de guía opcionalmente ligados a un trophy_id" "$M" "area:guides" \
  "Modelo guide_steps (CLAUDE.md 'Modelo de datos')." \
  "- [ ] Paso puede existir sin trofeo o ligado a uno específico
- [ ] Reordenamiento de pasos" \
  "N/A"
create_issue "Checklist de pasos completados por el usuario" "$M" "area:guides,area:ui" \
  "Modelo user_guide_progress (CLAUDE.md 'Modelo de datos')." \
  "- [ ] Tildar/destildar persistido en user_guide_progress
- [ ] Progreso independiente de sync (se puede tildar manualmente)" \
  "N/A"

# --- Fase 5 ---
M="Fase 5 - Checklist cruzada"
create_issue "Cruzar user_guide_progress con user_trophies" "$M" "area:guides" \
  "Pilar 3 del producto: sync con PSN cruzado con guías (CLAUDE.md 'Visión del producto')." \
  "- [ ] Paso ligado a trophy_id ya desbloqueado se marca automáticamente
- [ ] No pisa un tilde manual previo" \
  "N/A"

# --- Fase 6 ---
M="Fase 6 - Advisor con IA"
create_issue "lib/ai/ - cliente, prompt y validación de schema" "$M" "area:ai" \
  "Advisor con IA, aislado como lib/psn/ y lib/covers/ (PRODUCT_SPEC.md sección 4)." \
  "- [ ] Toda llamada al LLM vive en lib/ai/
- [ ] Input con nombre/plataforma/trofeos(nombre,descripción,tipo,oculto,obtenido)/guías propias
- [ ] Output validado contra JSON schema, un reintento si inválido y luego status:error" \
  "N/A"
create_issue "Endpoint 'generar plan' por juego" "$M" "area:ai" \
  "Acción explícita del usuario para generar el plan de IA." \
  "- [ ] Server-side only, API key nunca expuesta al cliente
- [ ] Acción explícita del usuario (botón), no automática" \
  "N/A"
create_issue "UI del panel de advisor (resumen, missables, orden sugerido, tips)" "$M" "area:ai,area:ui" \
  "Presentación del plan generado por IA." \
  "- [ ] Etiquetado claro como contenido generado por IA con aviso de verificar
- [ ] Maneja status:error mostrando 'no se pudo generar', nunca 500 silencioso" \
  "N/A"
create_issue "Cacheo en ai_game_plans + botón regenerar" "$M" "area:ai" \
  "Modelo ai_game_plans (CLAUDE.md 'Modelo de datos' + PRODUCT_SPEC.md sección 6)." \
  "- [ ] 'Regenerar' crea fila nueva versionada, no pisa la anterior
- [ ] Plan servido desde caché mientras no se pida explícitamente" \
  "N/A"

# --- Fase 7 ---
M="Fase 7 - Sync automatico + expiracion de token"
create_issue "Cron de sync periódico (Vercel Cron o Supabase Edge Function)" "$M" "area:psn,area:infra" \
  "Sync automático (CLAUDE.md 'Roadmap sugerido' paso 4 y 'Cron/jobs')." \
  "- [ ] Sync programado en background, no disparado por requests
- [ ] Frecuencia razonable
- [ ] Logs suficientes sin exponer NPSSO" \
  "N/A"
create_issue "Detección de NPSSO vencido + aviso de reconexión" "$M" "area:psn,area:ui" \
  "Manejo de expiración de token en sync automático." \
  "- [ ] Cron detecta fallo de auth y actualiza estado en psn_accounts
- [ ] Usuario ve aviso la próxima vez que entra" \
  "N/A"

# --- Fase 8 ---
M="Fase 8 - Caratulas enriquecidas"
create_issue "lib/covers/ - resolución RAWG con fallback SteamGridDB" "$M" "area:covers" \
  "Carátulas enriquecidas vía RAWG/SteamGridDB, server-side (aislado como lib/psn/ y lib/ai/)." \
  "- [ ] Aislado en lib/covers/, mismo patrón que lib/psn/ y lib/ai/
- [ ] RAWG primero, fallback SteamGridDB
- [ ] API keys server-side (RAWG_API_KEY, STEAMGRIDDB_API_KEY) nunca NEXT_PUBLIC_
- [ ] Si ninguna fuente tiene el juego, UI cae a ícono PSN sin romperse" \
  "Nice-to-have, no bloqueante para el resto del MVP."
create_issue "Cacheo de cover_url en la tabla games" "$M" "area:covers,area:db" \
  "Evitar resolver covers en cada carga (CLAUDE.md 'Modelo de datos')." \
  "- [ ] URL resuelta se guarda en games.cover_url
- [ ] Estrategia clara de cuándo re-resolver (si null, no en cada carga)" \
  "N/A"

# --- Fase 9 ---
M="Fase 9 - Enlaces a guias externas curadas"
create_issue "Modelo + UI para links externos con atribución de fuente" "$M" "area:guides,area:ui" \
  "Enlaces a fuentes externas, sin scraping (CLAUDE.md 'Guías de desbloqueo: enfoque' punto 2)." \
  "- [ ] Soporta PowerPyx, PSNProfiles, TrueTrophies, IGN, YouTube con nombre de fuente visible
- [ ] target=\"_blank\" rel=\"noopener noreferrer\"
- [ ] Nunca copia/scrapea contenido" \
  "N/A"

# --- Fase 10 ---
M="Fase 10 - Pulido y deploy productivo"
create_issue "Revisión de accesibilidad (contraste, foco de teclado)" "$M" "area:ui" \
  "Pulido final antes del deploy productivo." \
  "- [ ] Contraste WCAG AA en tema oscuro, especialmente los 4 colores de trofeo sobre fondo oscuro
- [ ] Navegación completa por teclado en flujos clave (login, conectar PSN, sync, guías)" \
  "N/A"
create_issue "Manejo de estados vacíos/loading/error en toda la app" "$M" "area:ui" \
  "Pulido final antes del deploy productivo." \
  "- [ ] Ninguna vista clave se queda en blanco sin feedback (biblioteca vacía, sync en curso, error de red)" \
  "N/A"
create_issue "QA end-to-end del flujo completo" "$M" "area:infra" \
  "Cierre del MVP, validación de los 3 pilares del producto." \
  "- [ ] Flujo probado manualmente: registro → conexión PSN → sync manual → biblioteca/trofeos reales → crear guía → generar plan IA → checklist cruzada
- [ ] Deploy productivo en Vercel con env vars reales" \
  "N/A"

echo "== 5. GitHub Project (v2) =="
PROJECT_TITLE="Proyecto Platino - MVP"
project_number="$(gh project list --owner "$OWNER" --format json -q ".projects[] | select(.title==\"$PROJECT_TITLE\") | .number" 2>/dev/null | head -n1 || true)"
if [ -z "${project_number:-}" ]; then
  gh project create --owner "$OWNER" --title "$PROJECT_TITLE" >/dev/null
  project_number="$(gh project list --owner "$OWNER" --format json -q ".projects[] | select(.title==\"$PROJECT_TITLE\") | .number" | head -n1)"
  echo "  proyecto creado (#$project_number)"
else
  echo "  proyecto ya existe (#$project_number)"
fi

fields_json="$(gh project field-list "$project_number" --owner "$OWNER" --format json)"
ensure_field () {
  local name="$1" opts="$2"
  if ! grep -q "\"name\":\"$name\"" <<< "$(echo "$fields_json" | tr -d '\n ')"; then
    gh project field-create "$project_number" --owner "$OWNER" --name "$name" \
      --data-type SINGLE_SELECT --single-select-options "$opts" >/dev/null 2>&1 || true
    echo "  campo '$name' creado (o ya existía)."
    fields_json="$(gh project field-list "$project_number" --owner "$OWNER" --format json)"
  else
    echo "  campo '$name' ya existe."
  fi
}
ensure_field "Estado" "Backlog,To Do,In Progress,In Review,Done"
ensure_field "Prioridad" "P0,P1,P2"

echo "  agregando issues al Project..."
all_issue_numbers="$(gh issue list --repo "$FULL" --state all --limit 200 --json number -q '.[].number')"
for n in $all_issue_numbers; do
  gh project item-add "$project_number" --owner "$OWNER" \
    --url "https://github.com/$FULL/issues/$n" >/dev/null 2>&1 || true
done
echo "  issues agregados al Project #$project_number."

echo "== Listo =="
echo "Nota: los valores de Estado/Prioridad por issue y el detalle fino de estados"
echo "se setean una vez con 'gh project item-edit' (ver historial de setup); este"
echo "script solo garantiza que campos e items existan de forma idempotente."
