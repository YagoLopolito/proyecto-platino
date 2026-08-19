-- ID de grupo de trofeos que devuelve PSN: "default" para el juego base,
-- "001"/"002"/etc. para DLC/expansiones. Se usa para excluir del prompt del
-- advisor de IA los trofeos que no pertenecen al juego base y así ahorrar
-- tokens en juegos con muchos DLC (ver lib/ai/prompt.ts).
alter table public.trophies add column trophy_group_id text;
