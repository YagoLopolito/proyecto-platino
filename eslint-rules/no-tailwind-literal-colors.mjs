/**
 * Regla de ESLint del sistema de diseño (issue #176, fase 6).
 *
 * Prohíbe los colores literales de la paleta de Tailwind (`zinc-800`,
 * `blue-500/20`, `emerald-400`...) en `app/` y `components/`. Todo color pasa
 * por un token de `app/globals.css` (`bg-surface`, `text-ink-muted`,
 * `border-border`, `text-accent-ink`...). Si hace falta un color que no
 * existe, se agrega como token con su rol, no se hardcodea en el JSX.
 *
 * Por qué una regla y no sólo la convención: el remake bajó de 566 `zinc-*` a
 * 0 en cinco PRs, y sin algo que falle en CI el número vuelve a subir de a un
 * `text-zinc-400` "por ahora" por vez. Es el mismo bug que motivó el issue:
 * dos sistemas conviviendo y ganando el improvisado.
 *
 * Qué mira: cualquier string (literal, template o atributo JSX) del archivo,
 * no sólo `className`. Un color puede venir de un `clsx(...)`, de un mapa
 * `{ bronze: "text-amber-500" }` o de un `cva` — el punto es que no aparezca
 * en el código de UI, sin importar por qué camino llegue a la clase.
 *
 * Qué NO mira: `white`, `black`, `transparent` y `current` son valores, no
 * escalones de la paleta, y tienen usos legítimos (texto blanco sobre un
 * relleno de acento, `bg-black/70` de un backdrop de modal).
 */

const PALETTE =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
const SHADE = "(?:50|[1-9]00|950)";

/*
 * `\b` a la izquierda: el color viene siempre después de un guion
 * (`bg-zinc-900`, `hover:text-blue-400`), así que lo único que hay que evitar
 * es que una palabra que termine igual cuente (`redirect-500`, `skyline-200`).
 * Después del escalón puede venir opacidad (`/20`) o el fin de la clase.
 */
const LITERAL_COLOR = new RegExp("\\b" + PALETTE + "-" + SHADE + "(?!\\w)", "g");

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Prohíbe colores literales de Tailwind: todo color pasa por un token de app/globals.css",
    },
    schema: [],
    messages: {
      literalColor:
        'Color literal de Tailwind "{{color}}". Usá un token del sistema de diseño (app/globals.css): bg-surface, text-ink-muted, border-border, text-accent-ink, text-success... Si no existe el que necesitás, agregalo como token con su rol.',
    },
  },
  create(context) {
    function check(node, text) {
      for (const match of text.matchAll(LITERAL_COLOR)) {
        context.report({ node, messageId: "literalColor", data: { color: match[0] } });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};

export default rule;
