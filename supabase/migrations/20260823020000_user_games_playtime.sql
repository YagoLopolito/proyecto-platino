-- Horas jugadas que devuelve GetOwnedGames (playtime_forever, en minutos).
--
-- No es un dato decorativo: es lo único que permite distinguir un juego que el
-- usuario realmente juega de los free-to-play reclamados y nunca abiertos, las
-- demos y los playtests, que en Steam se acumulan en la biblioteca por decenas.
-- GetOwnedGames no dice qué tipo de app es cada una, así que el criterio es
-- "cero minutos y cero logros" (ver /juegos y /perfil).
--
-- NULL = no se sabe (juegos de PSN, catálogo o cargados a mano).
alter table public.user_games
  add column if not exists playtime_minutes integer;
