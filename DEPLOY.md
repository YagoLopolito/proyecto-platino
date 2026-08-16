# Deploy

## Vercel

El repo ya esta conectado a un proyecto Vercel (`proyecto-platino`, team `Wasca Games`,
project id `prj_whScZkZeVelVYEOwkQDZNk2PliNJ`), creado automaticamente desde este PR.

Pendiente manual (el rol usado para conectar el proyecto no tiene permiso para crear
deployments ni leer/escribir env vars en el team):

1. En el dashboard de Vercel > proyecto `proyecto-platino` > Settings > Environment
   Variables, cargar las 4 variables de `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PSN_TOKEN_ENCRYPTION_KEY`
   (requiere primero tener el proyecto Supabase real, ver mas abajo).
2. Disparar un deploy manualmente (push a una rama, o "Redeploy" desde el dashboard)
   para generar el primer preview funcional.

## Supabase

Al momento de este setup, la organizacion "Wasca Games" ya tenia 2 proyectos Supabase
free activos (limite del plan gratuito por organizacion). Falta:

1. Pausar/eliminar uno de los proyectos existentes, o actualizar el plan de la
   organizacion.
2. Crear el proyecto `proyecto-platino` en Supabase (region sugerida `us-east-1`).
3. Copiar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
   `SUPABASE_SERVICE_ROLE_KEY` reales a `.env.local` (no versionado) y a las env vars
   de Vercel.
