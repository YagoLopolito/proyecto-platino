# Accesibilidad: contraste y foco de teclado

Auditoría del issue #69 ("Revisión de contraste y foco de teclado con la paleta
nueva"), sobre los componentes compartidos de `components/` y la paleta
`zinc`/`blue`/tokens custom de `app/globals.css`.

## Foco de teclado

Ya cubierto por el PR #81: `Input`/`Select`/`Textarea`/`Button` tienen
`focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`,
propagado a login, registro, conexión PSN y guías. Tab-order verificado
manualmente en esos cuatro flujos: sigue el orden visual, sin trampas de foco.

## Contraste (WCAG 2.1 AA)

Umbrales usados: **4.5:1** para texto normal, **3:1** para texto grande
(≥18.66px o ≥14px bold) y para los bordes de controles interactivos (input,
button) contra su fondo adyacente (WCAG 1.4.11, non-text contrast). Colores de
fondo con opacidad (`/10`, `/30`, etc.) se midieron ya mezclados sobre el
fondo real donde aparecen (tarjeta `zinc-900` o página `zinc-950`).

Ratios calculados con la fórmula de luminancia relativa de WCAG (ver script
usado para esta auditoría, no versionado — cálculo estándar `(L1+0.05)/(L2+0.05)`).

### Encontrado y corregido

| Componente | Antes | Ratio antes | Después | Ratio después |
|---|---|---|---|---|
| `Button` ghost (texto default) | `text-zinc-500` sobre `zinc-950` | 4.12:1 (falla) | `text-zinc-400` | 7.76:1 |
| `Button` primary (hover) | texto blanco sobre `hover:bg-blue-500` | 3.68:1 (falla) | `hover:bg-blue-700` | 6.70:1 |
| `Button` secondary/danger (borde) | `border-zinc-700` sobre fondo del botón | 1.91:1 (falla, <3:1) | `border-zinc-500` | 4.12:1 |
| `Input`/`Select`/`Textarea` (borde) | `border-zinc-700` sobre `bg-zinc-800` | 1.43:1 (falla, <3:1) | `border-zinc-500` | 3.08:1 |
| `EmptyState` (texto) | `text-zinc-500` | 4.12:1 (falla) | `text-zinc-400` | 7.76:1 |
| `LoadingState` (texto) | `text-zinc-500` | 4.12:1 (falla) | `text-zinc-400` | 7.76:1 |
| `GameCard` (placeholder "Sin img", plataforma, badge "Pendiente de sincronizar") | `text-zinc-500` | 3.08–4.12:1 (falla) | `text-zinc-400` | 5.81–7.76:1 |
| `GameBreadcrumb` (hover de links) | `hover:text-accent` (`--color-accent` `#0070d1`) | 3.58–4.02:1 (falla) | `hover:text-[var(--color-accent-hover)]` (`#2e8cef`) | 5.16–5.79:1 |

`zinc-500` como color de borde en estado *hover*/foco (p. ej. `Button`
secondary `hover:border-zinc-400`, o el ring de foco en azul) no tiene el
mismo requisito estricto porque son estados transitorios sobre un elemento ya
identificable en su estado default — pero igual quedaron con ratios ≥3:1.

### Verificado, sin cambios (ya cumplía)

| Componente | Combinación | Ratio |
|---|---|---|
| `Input`/`Textarea`/`Select` (texto) | `text-zinc-50` sobre `bg-zinc-800` | 14.27:1 |
| `Label` | `text-zinc-400` sobre fondo de página | 6.91–7.76:1 |
| `Button` secondary/danger (texto) | `text-zinc-400` | 6.91–7.76:1 |
| `Button` primary (texto, estado default) | blanco sobre `bg-blue-600` | 5.17:1 |
| `StatCard` (label) | `text-zinc-400` sobre `bg-zinc-950` | 7.76:1 |
| `ErrorState` | `text-red-400` sobre `bg-red-950/30` mezclado sobre `zinc-950` | 6.96:1 |
| `FormError` / `FormSuccess` | `text-red-400` / `text-green-400` sobre fondo de página | 6.96:1 / 8.72:1 |
| `SyncStatusBadge` (los 3 estados) | texto sobre su propio fondo `/10` mezclado sobre `zinc-900` | 5.83–9.02:1 |
| `PlatinumBadge` | texto sobre fondo `/10` mezclado sobre `zinc-900` | 9.16:1 |
| `TrophyTypeIcon` (los 4 colores, como gráfico ≥3:1) | íconos sobre `bg-zinc-900` | 5.63–12.89:1 |
| `GameBreadcrumb` (paso actual, no-link) | `text-zinc-100` sobre `zinc-950` | 18.10:1 |

### Pendiente / fuera de alcance de este PR

- `PlatinumBadge` usa el hex hardcodeado `#B9D3E8`, que no coincide con el
  token `--color-trophy-platinum` (`#b9e1ff`) que sí usa `TrophyTypeIcon`.
  Contraste similar en ambos casos (no es un problema de accesibilidad), pero
  vale la pena unificarlo a futuro para que no diverjan si se retoca la
  paleta.
- Esta auditoría cubrió `components/`. Páginas en `app/` reusan mayormente
  estos mismos componentes; donde no (ej. clases `text-zinc-500` sueltas en
  JSX de página), aplica el mismo criterio: mínimo `zinc-400` para texto
  informativo sobre fondos `zinc-900`/`zinc-950`.
