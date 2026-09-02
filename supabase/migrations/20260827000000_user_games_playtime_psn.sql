-- `user_games.playtime_minutes` deja de ser un dato exclusivo de Steam: el sync
-- de PSN también lo escribe, desde el `playDuration` de `getUserPlayedGames`.
--
-- No hay cambio de estructura (la columna existe desde
-- 20260823020000_user_games_playtime.sql); esto deja el significado registrado
-- en la base y no sólo en el archivo de aquella migración.
comment on column public.user_games.playtime_minutes is
  'Minutos jugados. Steam: playtime_forever de GetOwnedGames. PSN: playDuration de getUserPlayedGames, cruzado por nombre normalizado (PSN indexa por titleId y los trofeos por npCommunicationId). NULL = no se sabe (juegos de catálogo, carga manual, o títulos de PSN sin horas reportadas). Los contadores de las dos plataformas no son comparables entre sí: nunca sumarlos.';
