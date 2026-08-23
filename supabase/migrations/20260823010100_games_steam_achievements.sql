-- El sync de Steam pide el schema de logros juego por juego. Muchos títulos
-- (sobre todo free-to-play y clásicos) simplemente no tienen logros: sin
-- registrar ese hecho, cada sync vuelve a preguntar por todos ellos y quema
-- llamadas de la cuota diaria de la key al pedo.
--
-- NULL = todavía no se preguntó; false = confirmado sin logros; true = tiene.
alter table public.games
  add column if not exists steam_has_achievements boolean;

comment on column public.games.steam_has_achievements is
  'Solo para source = ''steam''. false = GetSchemaForGame vino vacío, no volver a pedirlo en cada sync.';
