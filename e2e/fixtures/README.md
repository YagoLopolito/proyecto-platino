# Fixtures de datos

Payloads deterministas que consumen los mocks de `E2E_MOCKS=1` (fase B del plan,
ver `TESTING_PRD.md` seccion 4). Cada archivo exporta datos, nunca logica:

- `psn.ts` — identidad y biblioteca que devuelve el mock de `lib/psn/`
- `ai.ts` — plan valido e invalido para `lib/ai/`
- `catalog.ts` — resultados de busqueda de `lib/covers/`

Las fixtures se derivan de payloads reales capturados con la suite `@live`, no
se inventan a mano: si el mock se desincroniza de la API real, los tests pasan
en verde mientras produccion esta rota.
