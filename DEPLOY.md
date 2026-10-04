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

## Galería online (publicaciones de fotos y videos)

Pasos al deployar la Galería online, en este orden:

1. Migraciones `20261004000000_posts.sql` y `20261004000100_post_media_orphans.sql` (tablas,
   bucket privado `post-media` y sus policies).
2. Migración `20261004000200_posts_received_activity.sql` (likes y comentarios en Actividad ›
   Recibido, globito de no leídas). Recrea `get_activity_received` con una columna más: el
   código anterior la ignora, así que se puede aplicar antes o después del deploy.
3. `node scripts/migrate-screenshots-to-posts.mjs --dry-run` y después sin `--dry-run`, con
   `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`: pasa cada captura de la galería vieja a una
   publicación y borra el bucket público `game-screenshots`.
4. Recién ahí `20261004000300_drop_game_screenshots.sql` (se niega a correr si quedó alguna
   captura sin migrar).

**Storage en el plan Free**: 50 MB por archivo (es el tope de un video en la app) y 1 GB para
todo el proyecto. Para ver cuánto se usa:

```sql
select bucket_id, pg_size_pretty(sum((metadata->>'size')::bigint)) as usado, count(*)
from storage.objects group by bucket_id;
```

Si se pasa a Pro, subir `MAX_VIDEO_BYTES` / `MAX_IMAGE_BYTES` en `lib/posts/constants.ts` **y**
el `file_size_limit` del bucket `post-media`.
