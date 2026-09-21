import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";
import noTailwindLiteralColors from "./eslint-rules/no-tailwind-literal-colors.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  eslintConfigPrettier,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Sistema de diseño (issue #176): ningún color literal de Tailwind en el
    // código de UI, todo pasa por un token de `app/globals.css`. La regla está
    // acotada a `app/` y `components/` a propósito: `lib/` no pinta nada, y
    // `e2e/` necesita escribir "zinc-900" para assertear que NO aparece.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    plugins: {
      "design-system": { rules: { "no-tailwind-literal-colors": noTailwindLiteralColors } },
    },
    rules: {
      "design-system/no-tailwind-literal-colors": "error",
    },
  },
  {
    // Los fixtures de Playwright reciben un callback llamado `use`, que la regla
    // de React confunde con un Hook. No hay React en la carpeta de tests.
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktrees locales de Claude Code: traen su propio `.next/` compilado y
    // no están en git. Sin esto, `npm run lint` en local tarda minutos y
    // reporta miles de errores que no son de este repo.
    ".claude/**",
  ]),
]);

export default eslintConfig;
