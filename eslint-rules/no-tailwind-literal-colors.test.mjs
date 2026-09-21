/*
 * Test de la regla, con el RuleTester de ESLint. Corre con
 * `npm run lint:rules`, sin Playwright ni
 * Supabase: es una regla de lint, no comportamiento de la app.
 */
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-tailwind-literal-colors.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

tester.run("no-tailwind-literal-colors", rule, {
  valid: [
    // Tokens del sistema.
    { code: '<div className="bg-surface text-ink-muted border-border" />' },
    { code: '<div className="text-accent-ink hover:bg-accent-hover bg-rarity-ultra/10" />' },
    // Valores, no escalones de la paleta.
    { code: '<div className="text-white bg-black/70 to-transparent bg-current" />' },
    // Un token propio con un nombre parecido a la paleta no es un literal.
    { code: 'const c = "text-trophy-gold text-trophy-silver";' },
    // Palabras que contienen un nombre de la paleta sin ser un color.
    { code: "const t = `redirect-500 skyline-200`;" },
  ],
  invalid: [
    {
      code: '<div className="bg-zinc-900" />',
      errors: [{ messageId: "literalColor", data: { color: "zinc-900" } }],
    },
    {
      code: '<div className="border border-zinc-800/50 text-blue-400" />',
      errors: [
        { messageId: "literalColor", data: { color: "zinc-800" } },
        { messageId: "literalColor", data: { color: "blue-400" } },
      ],
    },
    {
      // No sólo className: también mapas y helpers.
      code: 'const byType = { bronze: "text-amber-500", gold: "text-yellow-400" };',
      errors: [{ messageId: "literalColor" }, { messageId: "literalColor" }],
    },
    {
      code: "const cls = `bg-emerald-950 ${active ? 'ring-emerald-400' : ''}`;",
      errors: [{ messageId: "literalColor" }, { messageId: "literalColor" }],
    },
    {
      code: '<div className="from-blue-900/70 via-zinc-800 hover:text-slate-50 dark:bg-stone-950" />',
      errors: [
        { messageId: "literalColor" },
        { messageId: "literalColor" },
        { messageId: "literalColor" },
        { messageId: "literalColor" },
      ],
    },
  ],
});
