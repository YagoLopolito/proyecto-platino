-- Resumen de trofeos real que devuelve PSN (getUserTrophyProfileSummary):
-- nivel, progreso hacia el siguiente nivel, tier y trofeos ganados por tipo.
-- Antes el perfil calculaba el nivel a mano con la curva de puntos, que no
-- coincide con el número que muestra PSN.
alter table public.psn_accounts
  add column trophy_level integer,
  add column trophy_progress integer,
  add column trophy_tier integer,
  add column earned_platinum integer,
  add column earned_gold integer,
  add column earned_silver integer,
  add column earned_bronze integer;
