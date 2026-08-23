-- Híbrido terminado/platino (issue #96): el usuario carga la fecha a mano y, si
-- el sync de PSN detecta después el trofeo Platino de ese juego, la entrada del
-- diario se marca sola (o se crea una nueva si no había ninguna cercana).
--
-- No se agregan policies nuevas: `source` y `platinum_earned_at` viven en
-- game_diary_entries, que ya tiene RLS (select público, insert/update/delete
-- solo del dueño) desde 20260821000000_letterbox_diary.sql.

alter table public.game_diary_entries
  add column if not exists source text not null default 'manual',
  add column if not exists platinum_earned_at timestamptz;

alter table public.game_diary_entries drop constraint if exists game_diary_entries_source_check;
alter table public.game_diary_entries
  add constraint game_diary_entries_source_check check (source in ('manual', 'platinum_sync'));

comment on column public.game_diary_entries.source is
  'manual = la cargó el usuario; platinum_sync = la creó el sync de PSN al detectar el platino.';
comment on column public.game_diary_entries.platinum_earned_at is
  'Fecha real de desbloqueo del platino según PSN, si el sync lo cruzó con esta entrada.';
