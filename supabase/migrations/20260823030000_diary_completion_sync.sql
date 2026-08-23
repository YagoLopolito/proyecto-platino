-- Equivalente al platino para Steam: el 100% de los logros.
--
-- Va en su propia columna y NO en `platinum_earned_at` a propósito: ese campo
-- significa "platino de PSN" en toda la app (hay UI que lo lee así) y Steam no
-- tiene platino. Son dos condiciones distintas: el platino es un trofeo real
-- que existe en la lista; el 100% es una condición derivada.
alter table public.game_diary_entries
  add column if not exists completed_at timestamptz;

comment on column public.game_diary_entries.completed_at is
  'Fecha del último logro de un juego completado al 100% (Steam). El platino de PSN va en platinum_earned_at.';

-- Mismo criterio que 'platinum_sync': distingue las entradas que creó la
-- auto-detección de las que cargó el usuario a mano.
alter table public.game_diary_entries drop constraint if exists game_diary_entries_source_check;
alter table public.game_diary_entries
  add constraint game_diary_entries_source_check
  check (source in ('manual', 'platinum_sync', 'completion_sync'));
