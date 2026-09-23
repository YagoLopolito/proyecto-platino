# Accesibilidad: contraste y foco de teclado

> **Nota (fase 6 del issue #176):** las dos primeras secciones ("Foco de teclado" y
> "Contraste") son la auditoría original del issue #69 sobre la piel anterior, con
> `zinc-*`/`blue-*` a mano. Esos colores **ya no existen en el código** (ESLint los rechaza
> en `app/` y `components/`): las tablas quedan como historia de qué problemas tenía cada
> componente y por qué los umbrales de los tokens son los que son. Lo vigente es de "Tokens
> del sistema de diseño" para abajo: ahí cada token está auditado contra las cuatro
> superficies. Los targets táctiles de 44px, `aria-current` en las navs y `role="switch"` en
> los toggles se conservaron en el remake y los verifican `21-design-system.spec.ts` y los
> tests de cada pantalla.

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

---

## Tokens del sistema de diseño (fase 1 del issue #176)

Auditoría de la paleta nueva de `app/globals.css`, hecha **antes** de migrar
las pantallas: si un token no pasa AA, lo hereda cada componente que lo use
después, y corregirlo más tarde es recolorear la app entera de nuevo.

Umbrales: **4.5:1** texto normal, **3:1** texto grande (≥18.66px, o ≥14px
bold) y bordes de controles interactivos (WCAG 1.4.11). Cada token se midió
contra las **cuatro** superficies del tema y se reporta el **peor** caso
(`--surface-hover`, la más clara): un token que sólo pasa sobre el fondo más
oscuro falla apenas se lo usa dentro de una tarjeta en hover.

### Corregido durante la auditoría

| Token | Valor inicial | Peor ratio | Valor final | Peor ratio |
|---|---|---|---|---|
| `--ink-faint` | `#6b7490` | 3.27:1 (falla) | `#858ea6` | 4.63:1 |
| `--border-strong` | `#3a4459` | 1.55:1 (falla 1.4.11) | `#687694` | 3.33:1 |
| `--accent-hover` | `#2e8cef` | blanco encima 3.43:1 (falla) | `#005cab` | blanco encima 6.73:1 |

Las tres son la misma clase de error y vale dejarla anotada:

1. **`--ink-faint`**: se pensó como "el gris más apagado que se banque". Pero
   su uso principal son las versalitas de `type-overline`, que son de 11px —
   texto chico, umbral 4.5:1, no 3:1.
2. **`--border-strong`**: un borde decorativo puede ser sutil; el borde que
   *delimita un input* es lo que hace que el control se vea, y WCAG le pide
   3:1.
3. **`--accent-hover`**: el hover de un relleno primario tiene que ir más
   **oscuro**, no más claro. Aclarándolo, el texto blanco encima cae a 3.43:1.
   Es exactamente el bug que ya se había corregido una vez (ver `Button`
   primary hover, más arriba) y que la paleta nueva estaba por reintroducir.

### El azul PSN necesita dos tokens

`--accent` (`#0070d1`) sirve como **relleno** (blanco encima: 4.95:1 AA) y
como gráfico no-texto (3.06:1 ≥ 3), pero **como texto no llega**: 3.06:1
contra la superficie más clara. Por eso existe `--accent-ink` (`#4c9df2`,
5.35:1), que es el acento cuando es texto o ícono sobre superficie oscura.

Los dos usos vivos de `text-accent` (la tab activa de `MobileTabBar`, el link
activo del header) eran texto chico en `#0070d1`, o sea que ya estaban
fallando: se pasaron a `text-accent-ink` en esta fase.

`--accent-2` (`#e6007a`, 3.35:1) queda restringido a **display grande y
rellenos**. Su único uso hoy es el "oob" del logo del header, que califica.

### Verificado, sin cambios

| Token | Peor ratio | Umbral |
|---|---|---|
| `--ink` | 12.68:1 | 4.5 |
| `--ink-muted` | 5.79:1 | 4.5 |
| `--success` | 7.88:1 | 4.5 |
| `--danger` | 5.48:1 | 4.5 |
| `--warning` | 9.08:1 | 4.5 |
| `--trophy-bronze` | 4.82:1 | 4.5 |
| `--trophy-silver` | 8.33:1 | 4.5 |
| `--trophy-gold` | 10.80:1 | 4.5 |
| `--trophy-platinum` | 11.02:1 | 4.5 |
| `--trophy-neutral` | 5.79:1 | 4.5 |
| `--border` (separador, no-texto) | 1.07:1 | — decorativo a propósito |

`--border` es deliberadamente sutil: es un hairline que separa, no un borde
que delimite un control. Lo que tiene que verse es `--border-strong`.

## Primitivas migradas (fase 2 del issue #176)

La fase 1 auditó cada token contra las cuatro superficies. La fase 2 introduce
**combinaciones** nuevas -- texto de un token sobre un fondo del mismo token
en baja opacidad -- que hay que medir aparte: el `/10` aclara la superficie y
baja el ratio respecto del que figura arriba. Peor caso sobre las cuatro
superficies:

| Combinación | Dónde | Peor ratio | Umbral |
|---|---|---|---|
| `text-success` sobre `bg-success/10` | `CompletionBadge`, `SyncStatusBadge` (válido) | 6.49:1 | 4.5 |
| `text-warning` sobre `bg-warning/10` | `SyncStatusBadge` (expirado) | 7.38:1 | 4.5 |
| `text-danger` sobre `bg-danger/10` | `SyncStatusBadge` (falló) | 4.74:1 | 4.5 |
| `text-trophy-platinum` sobre `bg-trophy-platinum/10` | `PlatinumBadge` | 8.49:1 | 4.5 |
| `text-accent-ink` sobre `bg-accent/15` | activo de `ToggleChip` y `SegmentedControl` | 4.67:1 | 4.5 |
| `border-accent-ink` sobre superficie | borde del activo, marco interno del segmentado | 5.35:1 | 3 (1.4.11) |
| `border-border-strong` sobre superficie | `Input`, `Select`, `SearchField`, `Button` secundario | 3.33:1 | 3 (1.4.11) |

El `/15` del relleno activo está en el límite y **no se sube**: a `/20` el
texto cae a 4.41:1 y falla. Si algún día hay que hacerlo más visible, el
camino es el borde, no el relleno.

Los bordes `/60` de los badges quedan entre 2.81:1 (`danger`) y 4.92:1
(`trophy-platinum`), o sea por debajo de 3:1 en un caso. **No es un fallo de
1.4.11**: un badge no es un control, el borde no delimita nada operable y el
texto adentro del chip dice el estado con palabras. Los tres estados de
`SyncStatusBadge` se distinguen por texto además de por color, así que
tampoco dependen de 1.4.1.

## Biblioteca y ficha de juego (fase 3 del issue #176)

La fase 3 migra `/juegos` y `/juegos/[id]` (lista de trofeos, hero, advisor).
Trae tres tokens nuevos y unas pocas combinaciones que no estaban medidas.

### Tokens nuevos: la rareza del trofeo

`RARITY_CLASS` pintaba los cuatro escalones con `fuchsia-300` / `rose-300` /
`sky-300` / `zinc-400` a mano. Son tokens propios y no los de trofeo: la
rareza es ortogonal al tipo (hay bronces ultra raros y platinos comunes), y
pintarla con el oro o la plata del tipo haría que las dos escalas se lean como
una sola. "Común" no lleva token: va con `ink-muted`, que es justamente el
nivel de "un metadato más".

Se miden ya mezclados sobre su propio fondo `/10`, que es como aparecen:

| Token | Dónde | Peor ratio | Umbral |
|---|---|---|---|
| `--rarity-ultra` (`#e879f9`) | chip "Ultra rara" sobre `bg-rarity-ultra/10` | 5.25:1 | 4.5 |
| `--rarity-very` (`#fb7185`) | chip "Muy rara" sobre `bg-rarity-very/10` | 4.86:1 | 4.5 |
| `--rarity-rare` (`#60c4f5`) | chip "Rara" sobre `bg-rarity-rare/10` | 6.29:1 | 4.5 |
| `--ink-muted` | chip "Común" sobre `bg-surface-hover` | 5.79:1 | 4.5 |

`--rarity-very` es el más justo de los tres (4.86:1) y por eso no se oscurece
más: el rosa es el escalón del medio y tiene que leerse distinto del magenta
de arriba sin acercarse al rojo de `danger`.

### Combinaciones nuevas

| Combinación | Dónde | Peor ratio | Umbral |
|---|---|---|---|
| `text-ink` sobre `bg-accent/10` | fila de trofeo enfocada desde el advisor | 11.64:1 | 4.5 |
| `ring-accent-ink` sobre superficie | la misma fila, su anillo de 1px | 5.35:1 | 3 (1.4.11) |
| `text-success` sobre `bg-success/10` | "Siguiente trofeo", chip de obtenido | 6.49:1 | 4.5 |
| `text-danger` sobre `bg-danger/5` | desafíos de dificultad del advisor | 5.11:1 | 4.5 |
| `text-warning` sobre `bg-warning/5` y `/10` | perdibles, "no se puede farmear" | 7.38:1 | 4.5 |
| `border-l-accent` (barra de 4px) | borde izquierdo de una sección del plan | 3.06:1 | 3 (1.4.11) |

La barra lateral de 4px queda justo en el umbral, y **no es lo único que
distingue una sección de otra**: cada una lleva su título y su ícono del set,
así que no depende de percibir el color (WCAG 1.4.1). El mismo criterio por el
que el advisor dejó de tener seis colores de sección: `warning` y `danger` se
reservan para lo que de verdad cuesta trofeos (perdibles y desafíos de
dificultad) y el resto es informativo.

### Lo que la fase no rompe

- **Targets táctiles**: la pill de sección de la ficha, el botón "Cómo
  desbloquearlo" y las opciones del filtro de plataforma conservan sus 44px
  (`min-h-11`) en mobile, bajando a `min-h-9` recién en `sm`.
- **`aria-current="page"`** sigue en el filtro de plataforma de la biblioteca,
  que pasó de tres píldoras sueltas a un marco único sin dejar de ser links.
- **Los íconos nuevos** (`link`, `book`, `help`, `alert`, `flame`, `bulb`,
  `list`, `repeat`, `arrow-down`) van todos sin `label`: acompañan a un texto
  que ya dice lo mismo, así que son decorativos y quedan `aria-hidden`. El
  botón de invertir el orden es la excepción aparente -- su ícono es
  decorativo, pero el botón tiene `aria-label` propio, que es donde
  corresponde ponerlo.

## Perfil, configuración y chrome (fase 5 del issue #176)

Con esta fase no queda ningún color literal de Tailwind en `app/` ni en
`components/`: la auditoría vieja de arriba ("Encontrado y corregido" /
"Verificado, sin cambios") queda como historia, y **los ratios que valen son
los de los tokens**.

### Combinaciones nuevas

| Combinación | Dónde | Peor ratio | Umbral |
|---|---|---|---|
| `text-success` sobre `bg-success/10` | chip "Conectada", aviso de Steam verificada | 6.49:1 | 4.5 |
| `text-warning` sobre `bg-warning/10` | chip "Necesita atención", aviso de OpenID, cuenta distinta | 7.38:1 | 4.5 |
| `text-ink-muted` sobre `bg-surface-hover` | chip "No conectada" | 5.79:1 | 4.5 |
| `text-danger` sobre `bg-danger/10` | `ErrorState` (ahora con ícono, mismo fondo) | 4.74:1 | 4.5 |
| `text-accent-ink` sobre superficie | tab activo del header, de la barra inferior y de Configuración | 5.35:1 | 4.5 |
| `text-ink-faint` sobre `bg-surface-raised` | ícono del `EmptyState` (gráfico) | 5.16:1 | 3 |
| `text-ink` sobre la banda del perfil (`accent/50` → `accent/15` sobre `surface`) | no hay texto sobre la banda: el nombre va debajo, sobre `surface` | 11.64:1 | 4.5 |
| `border-border-strong` sobre `bg-surface` | chips de `ProfileBadge`, `Disclosure` | 4.01:1 | 3 (1.4.11) |
| `text-ink` sobre `bg-background/80` | número de puesto del Top 5 sobre la carátula | ≥ 12.8:1 sobre un gris medio | 4.5 |

### El activo no es sólo un color

El tab activo del header, el de la barra inferior de mobile y el de
Configuración se marcan con **tres** señales: el acento, el peso (`600`
contra `500`) y una regla de 2px debajo o encima. Antes era sólo el color.
`aria-current="page"` sigue en los tres (`MobileTabBar` ya lo tenía; el
header también, y Configuración lo gana con `ConfigTabs`).

### Lo que la fase no rompe

- **Targets táctiles**: los tabs del header y de Configuración van a
  `min-h-11`; la barra inferior sigue en `min-h-14`; el `summary` de
  `Disclosure` mide 44px; los chips de amigos del perfil, `min-h-11` en mobile.
- **Los íconos nuevos** (`user`, `users`, `settings`, `download`, `offline`,
  `plus`, `logout`) van sin `label`: acompañan a un texto que ya lo dice o
  están dentro de un control con nombre propio (el tab, el botón). La
  excepción es el ícono de "tiene reseña" del feed de amigos, que **es** la
  información y por eso lleva `label="Tiene reseña"`.
- **El logo del header** es una imagen con `alt="Platinoob"` dentro de un
  link con `aria-label`: el nombre accesible del link no cambió.
- **`<details>` nativo** en `Disclosure`: el `summary` es un botón para el
  teclado y el lector de pantalla sin ningún ARIA a mano. El marker del
  navegador se oculta y lo reemplaza el chevron del set (decorativo).

### Pendiente

- El lint que prohíbe los colores literales (fase 6) es lo que evita que esta
  auditoría vuelva a desactualizarse: hasta entonces, la regla es convención.

## Paleta refinada (epic #183, issue #184)

El epic #183 copia la navegación de Letterboxd, y eso multiplica las barras de chrome, las
estrellas y los likes por toda la app. Antes de que eso pase, la paleta se reajustó y **se
volvió a auditar entera**: subir el fondo de un casi-negro a un gris azulado mueve el ratio
de cada token contra cada superficie, así que los valores de las tablas de arriba (fases 1-5)
quedan como historia y **los que valen son los de esta sección**.

Umbrales, igual que siempre: **4.5:1** texto normal, **3:1** texto grande y gráficos /
bordes de controles (WCAG 1.4.11). Cada token se midió contra **seis** fondos -- las cuatro
superficies más `chrome` y `chrome-raised` -- y se reporta el **peor** caso, que en todos es
`--surface-hover` (`#232c37`, la más clara).

### Superficies y chrome

Los seis salen del mismo tono (OKLCH h=255, C=0.024) a pasos iguales de luminosidad:

| Token | Valor | L (OKLCH) | Rol |
|---|---|---|---|
| `--chrome` | `#050c15` | 0.150 | header |
| `--chrome-raised` | `#09111b` | 0.175 | barra inferior de mobile |
| `--background` | `#0f1721` | 0.200 | fondo de página (antes `#0a0e17`, casi negro) |
| `--surface` | `#151e28` | 0.230 | tarjetas, filas, campos |
| `--surface-raised` | `#1c2530` | 0.260 | modales, popovers |
| `--surface-hover` | `#232c37` | 0.290 | hover / activo |

El problema que se arregló: entre `surface` y `surface-raised` había menos distancia que entre
los otros escalones, y en las filas con hairline se perdía cuál era cuál. Ahora el paso es
parejo en luminosidad percibida (OKLCH), no en hex.

### Tokens: valor y peor caso

| Token | Antes | Ahora | Peor ratio | Umbral | Nota |
|---|---|---|---|---|---|
| `--ink` | `#e7ebf3` | `#e7ebf3` | 11.82:1 | 4.5 | sin cambios |
| `--ink-muted` | `#98a0b4` | `#9aa3b6` | 5.57:1 | 4.5 | |
| `--ink-faint` | `#858ea6` | `#8e97ad` | 4.83:1 | 4.5 | con las superficies nuevas el viejo caía a 4.32:1 |
| `--border-strong` | `#687694` | `#76839e` | 3.71:1 | 3 (1.4.11) | el viejo quedaba en 3.10:1, sin margen |
| `--border` | `#232b3d` | `#2a3342` | 1.12:1 | — | hairline decorativo a propósito |
| `--accent` (gráfico) | `#0070d1` | `#2273dc` | 3.06:1 | 3 (1.4.11) | el viejo caía a 2.85:1 sobre las superficies nuevas |
| blanco sobre `--accent` | 4.95:1 | | 4.61:1 | 4.5 | texto del botón primario |
| blanco sobre `--accent-hover` | 6.73:1 | `#1259b5` | 6.73:1 | 4.5 | el hover sigue yendo más oscuro |
| `--accent-ink` | `#4c9df2` | `#5eaaf7` | 5.76:1 | 4.5 | |
| `--accent-2` | `#e6007a` | `#e6007a` | 3.12:1 | 3 | sólo display grande y base del like |
| `--rating` | — | = `--accent-ink` | 5.76:1 | 3 (ícono) | nuevo |
| `--rating-muted` | — | `#8e97ad` | 4.83:1 | 3 (ícono) | nuevo |
| `--like` | — | `#ff5c9d` | 4.89:1 | 3 (ícono) | nuevo; el ○ puro daría 3.12:1, sin margen |
| `--success` | `#34d399` | `#34d399` | 7.35:1 | 4.5 | |
| `--danger` | `#f87171` | `#ff8080` | 5.82:1 | 4.5 | ver `danger/10` abajo |
| `--warning` | `#fbbf24` | `#fbbf24` | 8.46:1 | 4.5 | |
| `--trophy-bronze` | `#cd7f32` | `#d68a44` | 5.10:1 | 4.5 | el viejo caía a 4.49:1 |
| `--trophy-silver` | `#c0c0c0` | `#c0c0c0` | 7.76:1 | 4.5 | |
| `--trophy-gold` | `#ffd700` | `#ffd700` | 10.07:1 | 4.5 | rating de la comunidad y platino |
| `--trophy-platinum` | `#b9e1ff` | `#b9e1ff` | 10.27:1 | 4.5 | |
| `--trophy-neutral` | `#98a0b4` | `#9aa3b6` | 5.57:1 | 4.5 | acompaña a `ink-muted` |
| `--rarity-ultra` | `#e879f9` | `#e879f9` | 5.74:1 | 4.5 | |
| `--rarity-very` | `#fb7185` | `#ff8095` | 5.90:1 | 4.5 | ver `/10` abajo |
| `--rarity-rare` | `#60c4f5` | `#60c4f5` | 7.20:1 | 4.5 | |

### Combinaciones (texto de un token sobre su propio fondo en baja opacidad)

| Combinación | Peor ratio | Umbral |
|---|---|---|
| `text-accent-ink` sobre `bg-accent/15` (activo de `ToggleChip`, `SegmentedControl`) | 4.94:1 | 4.5 |
| `text-success` sobre `bg-success/10` | 5.99:1 | 4.5 |
| `text-warning` sobre `bg-warning/10` | 6.80:1 | 4.5 |
| `text-danger` sobre `bg-danger/10` | 4.99:1 | 4.5 |
| `text-danger` sobre `bg-danger/5` | 5.40:1 | 4.5 |
| `text-trophy-platinum` sobre `bg-trophy-platinum/10` | 7.93:1 | 4.5 |
| `text-rarity-ultra` sobre `bg-rarity-ultra/10` | 4.87:1 | 4.5 |
| `text-rarity-very` sobre `bg-rarity-very/10` | 5.04:1 | 4.5 |
| `text-rarity-rare` sobre `bg-rarity-rare/10` | 5.89:1 | 4.5 |
| `text-ink` sobre `bg-accent/10` (trofeo enfocado desde el advisor) | 10.73:1 | 4.5 |
| `border-border-strong` sobre `bg-surface` (inputs, chips de perfil) | 4.41:1 | 3 (1.4.11) |
| `bg-accent` sobre `bg-chrome-raised` (el futuro botón + de la barra) | 4.11:1 | 3 (1.4.11) |

`danger` y `rarity-very` se aclararon **por** estas combinaciones: con los valores viejos y
las superficies nuevas, el chip sobre su `/10` caía a 4.36:1 y 4.47:1 -- fallaban por
centésimas. El `/15` del activo sigue sin poder subir a `/20` (4.71:1 hoy, pero sin margen
para el próximo ajuste de superficies).

### Qué quedó justo, y por qué alcanza

- **`--accent` como gráfico (3.06:1)** es el mismo ratio que tenía el `#0070d1` sobre las
  superficies viejas. No se puede subir sin romper el otro lado: para que el blanco encima
  pase 4.5:1, el azul no puede ser más luminoso que esto. Donde el acento es gráfico sobre
  una superficie clara (la barra de `ProgressBar`, la regla lateral de una sección del
  advisor), siempre va acompañado de un número o un título que dice lo mismo (1.4.1).
- **`--accent-2` (3.12:1)** queda sólo para display grande. Por eso el like tiene su propio
  token más claro y no usa el ○ directo.
