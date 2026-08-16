#!/usr/bin/env bash
# Proyecto Platino — setup de repo, labels, milestones e issues del MVP en GitHub.
# Requiere: gh CLI instalado y autenticado (`gh auth login`), y correr esto
# parado en la carpeta local del proyecto (E:\Projecto platino).
set -euo pipefail

OWNER="TU-USUARIO-GITHUB"   # <-- reemplazar por tu usuario u org de GitHub
REPO="proyecto-platino"     # <-- cambiar si querés otro nombre
VISIBILITY="private"        # private | public

echo "== 1. Creando repo $OWNER/$REPO ($VISIBILITY) =="
gh repo create "$OWNER/$REPO" --"$VISIBILITY" --source=. --remote=origin --push

echo "== 2. Creando labels =="
create_label () {
  gh label create "$1" --repo "$OWNER/$REPO" --description "$2" --color "$3" --force
}
create_label "area:infra"    "Infra, tooling, deploy"          "5319e7"
create_label "area:auth"     "Auth y sesiones"                 "1d76db"
create_label "area:db"       "Modelo de datos / Supabase"      "0e8a16"
create_label "area:security" "Seguridad / RLS / secretos"      "d73a4a"
create_label "area:psn"      "Integracion PSN (psn-api)"       "006b75"
create_label "area:ai"       "Advisor con IA"                  "fbca04"
create_label "area:guides"   "Guias y checklist"                "c5def5"
create_label "area:covers"   "Caratulas / imagenes"             "f9d0c4"
create_label "area:ui"       "Frontend / UI"                    "bfd4f2"

echo "== 3. Creando milestones (una por fase) =="
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
  gh api "repos/$OWNER/$REPO/milestones" -f title="$m" -f state="open" >/dev/null 2>&1 || true
done

echo "== 4. Creando issues =="
create_issue () {
  local title="$1" milestone="$2" labels="$3" body="$4"
  gh issue create --repo "$OWNER/$REPO" --title "$title" --body "$body" \
    --milestone "$milestone" --label "$labels"
}

# --- Fase 0 ---
M="Fase 0 - Setup del repo"
create_issue "Scaffolding Next.js (App Router) + TypeScript + Tailwind" "$M" "area:infra" "Inicializar el proyecto con App Router, TS estricto y Tailwind, segun CLAUDE.md."
create_issue "Configurar ESLint/Prettier y reglas de convenciones" "$M" "area:infra" "Sin 'any' fuera de boundaries de librerias externas. Ver seccion 'Convenciones de codigo' de CLAUDE.md."
create_issue "Configurar proyecto Supabase (cloud) + .env.example" "$M" "area:infra" "Crear proyecto Supabase y documentar variables de entorno esperadas (ver PRODUCT_SPEC.md seccion 9)."
create_issue "Configurar deploy inicial en Vercel" "$M" "area:infra" "Conectar el repo a Vercel para deploy continuo."

# --- Fase 1 ---
M="Fase 1 - Auth + esquema base"
create_issue "Auth de la app con Supabase (email/password)" "$M" "area:auth" "Login/registro propio de la app, separado de la sesion PSN."
create_issue "Migraciones de esquema base" "$M" "area:db" "Tablas: users, psn_accounts, games, trophies, user_trophies, guides, guide_steps, user_guide_progress, ai_game_plans."
create_issue "RLS en todas las tablas de usuario" "$M" "area:db,area:security" "Row Level Security desde la primera migracion, no despues."

# --- Fase 2 ---
M="Fase 2 - Conexion PSN + sync manual"
create_issue "Pantalla para pegar NPSSO con instrucciones" "$M" "area:psn,area:ui" "Explicar como obtener el NPSSO desde playstation.com / ca.account.sony.com/api/v1/ssocookie."
create_issue "lib/psn/ - wrapper de autenticacion y refresco de tokens" "$M" "area:psn" "Toda llamada a psn-api vive aca, nunca en componentes ni rutas sueltas."
create_issue "Endpoint de sync manual de trofeos" "$M" "area:psn" "Trae titulos + trofeos del usuario via psn-api y los persiste."
create_issue "Manejo de NPSSO invalido o vencido" "$M" "area:psn" "Mensaje claro al usuario para que reconecte pegando un NPSSO nuevo."

# --- Fase 3 ---
M="Fase 3 - Vista de perfil y biblioteca"
create_issue "Biblioteca de juegos (cover + % completitud + conteo por tipo)" "$M" "area:ui" "Iconos oficiales de PSN, barra de progreso, conteo bronce/plata/oro/platino."
create_issue "Vista de detalle de juego (lista de trofeos)" "$M" "area:ui" "Desbloqueado/no, oculto/no."
create_issue "Vista de perfil con stats globales" "$M" "area:ui" "Nivel de trofeos, rareza, totales."

# --- Fase 4 ---
M="Fase 4 - Guias propias (CRUD)"
create_issue "CRUD de guias (markdown) por juego" "$M" "area:guides" "Autor = unico editor en el MVP."
create_issue "Pasos de guia ligados opcionalmente a un trophy_id" "$M" "area:guides" ""
create_issue "Checklist de pasos completados por el usuario" "$M" "area:guides,area:ui" ""

# --- Fase 5 ---
M="Fase 5 - Checklist cruzada"
create_issue "Cruzar guide progress con trofeos ya sincronizados" "$M" "area:guides" "Marcar automaticamente un paso si el trofeo asociado ya esta desbloqueado."

# --- Fase 6 ---
M="Fase 6 - Advisor con IA"
create_issue "lib/ai/ - cliente, prompt y validacion de schema" "$M" "area:ai" "Ver PRODUCT_SPEC.md seccion 4 para el JSON esperado."
create_issue "Endpoint 'generar plan' por juego" "$M" "area:ai" "Server-side only, API key nunca en el cliente."
create_issue "UI del panel de advisor (resumen, missables, orden sugerido, tips)" "$M" "area:ai,area:ui" "Etiquetar claramente que es contenido generado por IA."
create_issue "Cacheo en ai_game_plans + boton regenerar" "$M" "area:ai" "Nueva fila versionada en vez de pisar la anterior."

# --- Fase 7 ---
M="Fase 7 - Sync automatico + expiracion de token"
create_issue "Cron de sync periodico (Vercel Cron o Supabase Edge Function)" "$M" "area:psn,area:infra" "Sync programado, no en cada request."
create_issue "Deteccion de NPSSO vencido + aviso de reconexion" "$M" "area:psn,area:ui" ""

# --- Fase 8 ---
M="Fase 8 - Caratulas enriquecidas"
create_issue "lib/covers/ - resolucion RAWG con fallback SteamGridDB" "$M" "area:covers" "Nice-to-have visual, no bloqueante para el resto del MVP."
create_issue "Cacheo de cover_url en la tabla games" "$M" "area:covers,area:db" ""

# --- Fase 9 ---
M="Fase 9 - Enlaces a guias externas curadas"
create_issue "Modelo + UI para links externos con atribucion de fuente" "$M" "area:guides,area:ui" "PowerPyx, PSNProfiles, TrueTrophies, IGN, YouTube. Nunca scrapear el contenido."

# --- Fase 10 ---
M="Fase 10 - Pulido y deploy productivo"
create_issue "Revision de accesibilidad (contraste, foco de teclado)" "$M" "area:ui" ""
create_issue "Manejo de estados vacios/loading/error en toda la app" "$M" "area:ui" ""
create_issue "QA end-to-end del flujo completo" "$M" "area:infra" "Registro -> conexion PSN -> sync -> guia -> advisor IA."

echo "== 5. Creando GitHub Project (v2) =="
gh project create --owner "$OWNER" --title "Proyecto Platino - MVP"
echo "Proyecto creado. Agrega los issues manualmente desde la UI del Project (Add items -> filtrar por repo),"
echo "o con 'gh project item-add' issue por issue si preferis automatizarlo tambien."

echo "== Listo =="
