# Typography

A trading screen is read in glances, at arm's length, for hours, and most of what is read is a number: a price against the one beside it, a size, the seconds left on a quote. The choices below are the ones the research supports, and where a choice is taste the sentence says so. No font is bundled. Every family, size, and weight is a CSS variable you set once, in your own stylesheet, and the one rule the components enforce on their own is that every number is set in lining, tabular figures.

## Defaults

- **Inter** for prose, labels, and chrome (`--tradecn-font-sans`). An open humanist sans, the class that read fastest in a glance-legibility bakeoff, where Frutiger and FF Meta led and Gill Sans and Eurostile trailed by about 20 ms at p = 0.001 ([Sawyer and colleagues, 2020](https://jdobr.es/pdf/Sawyer-etal-2020-Bakeoff.pdf)).
- **Inter with tabular lining figures** for the numbers in a grid (`--tradecn-font-numeric`, which is `var(--tradecn-font-sans)`). Letters stay proportional and the digits take one width through OpenType, so a column of prices lines up without a monospace face, which is the standing rule for columns of money ([Bringhurst's rule, summarized for fintech](https://medium.com/design-bootcamp/the-elements-of-fintech-typography-part-1-readable-money-b6c1226acbde)).
- **JetBrains Mono** for code, order ids, timestamps, and fraction quotes such as `99-16+` (`--tradecn-font-mono`). Its zero is slashed and its `1`, `l`, and `I` are three shapes, the disambiguation a screen face needs; IBM Plex Mono has the same properties and is the alternative if you prefer its shapes ([Braille Institute, on what makes a glyph unambiguous](https://www.brailleinstitute.org/freefont/)).
- **Atkinson Hyperlegible Next** and **Atkinson Hyperlegible Mono** under `data-accessibility="hyperlegible"` (`--tradecn-font-accessible`, `--tradecn-font-accessible-mono`). Drawn for low vision: an unambiguous `0`/`O`, `1`/`l`/`I`, and `B`/`8`, open counters, and spurs and tails that tell the letters apart ([Braille Institute](https://www.brailleinstitute.org/freefont/)).

Whether a face has serifs is not the axis that matters; the spacing between letters has the larger effect on how fast it reads ([Arditi and Cho](https://pmc.ncbi.nlm.nih.gov/articles/PMC4612630/)). So a serif your firm already licenses is not ruled out by the research, only by the checklist below.

The two themes wear these tokens too, with one difference: the terminal is a monospace screen, so its `--tradecn-font-numeric` is its mono stack, a design preference that keeps a themed grid in one family. Their `--font-sans` stays the system monospace stack it always was.

### Tokens

Every item that reads a font token installs these into `:root` and `.dark` if you do not already have them, so your own values survive a later install; a theme sets all of them. The sizes, line heights, and weights are for your own stylesheet: the components keep their own sizes (12 px in the blotter and watchlist presets, 11 px in the option chain, a density call one step under the floor below) and read only the families and the numeric variant.

| Token | Default | For |
|---|---|---|
| `--tradecn-font-sans` | `'Inter', ui-sans-serif, system-ui, sans-serif` | Prose, labels, chrome |
| `--tradecn-font-mono` | `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | Code, ids, timestamps, fraction quotes |
| `--tradecn-font-numeric` | `var(--tradecn-font-sans)` | Numbers in a grid |
| `--tradecn-font-accessible` | `'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', ui-sans-serif, system-ui, sans-serif` | The sans under the accessibility mode |
| `--tradecn-font-accessible-mono` | `'Atkinson Hyperlegible Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | The mono under the accessibility mode |
| `--tradecn-text-size-body` | `14px` | Body text; the ceiling for a default |
| `--tradecn-text-size-grid` | `13px` | A grid row |
| `--tradecn-text-size-grid-min` | `12px` | The floor for a grid |
| `--tradecn-line-height-body` | `1.45` | Body text |
| `--tradecn-line-height-grid` | `1.35` | A grid row |
| `--tradecn-font-weight-body` | `450` | Body text |
| `--tradecn-font-weight-grid` | `500` | A grid row; one step heavier on dark |
| `--tradecn-numeric-variant` | `lining-nums tabular-nums` | The one value that never changes |
| `--tradecn-color-body-fg` | `oklch(0.96 0 0)` dark, `oklch(0.2 0 0)` light | Body text: off-white, not pure white |
| `--tradecn-color-body-bg` | `oklch(0.14 0 0)` dark, `oklch(0.98 0 0)` light | Body background: near-black, not pure black |

The grid weight is one step heavier than the body's because thin strokes on a dark background lose to the glow around them; Bloomberg's terminal face, drawn for the screen by Matthew Carter, took a slightly thicker stroke on black and reported less fatigue ([Bloomberg on its terminal's design](https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/)). The two body colors are a design preference for long sessions, not a measured finding; the terminal theme's own foreground is already off-white, and its background is pure black by John's call.

## Bring your own font

Set the variables once. Everything tradecn draws follows them:

```css
:root {
  --tradecn-font-sans: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
  --tradecn-font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

`--tradecn-font-numeric` follows the sans unless you point it elsewhere. If your whole app should follow the same variables, so that the accessibility mode reaches your own text too, point Tailwind's stacks at them:

```css
@theme inline {
  --font-sans: var(--tradecn-font-sans);
  --font-mono: var(--tradecn-font-mono);
}
```

Loading is yours. The defaults are all free and on Google Fonts, so one link does it:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@100..800&display=swap">
```

Or self-host through Fontsource, one import per weight (`@fontsource/inter/500.css`, `@fontsource/jetbrains-mono/500.css`), which is what the playground and tradecn.dev do, so no preview calls a third party for its type. One thing to know: Fontsource's variable packages register the family under another name, `'Inter Variable'`, and shadcn's own Vite template loads Inter that way. If your app does, either add that name to the stack (`'Inter', 'Inter Variable', ui-sans-serif, ...`) or point the token at what you have, `--tradecn-font-sans: var(--font-sans)`. The Atkinson pair is a free download from the [Braille Institute](https://www.brailleinstitute.org/freefont/) and is on Google Fonts and Fontsource as well (`@fontsource/atkinson-hyperlegible-next`, `@fontsource/atkinson-hyperlegible-mono`).

Whatever family you choose, the components still set `font-variant-numeric: lining-nums tabular-nums` on every number. That is not a variable.

## Numeric rendering

Any component rendering numeric data MUST set `font-variant-numeric: lining-nums tabular-nums` on the numeric node. It is rule 14 of [the item contract](contract.md), and the one typographic rule the registry enforces whatever font you chose.

Why both. Tabular figures give every digit one width, so `1,111.11` and `8,888.88` put their decimal points in the same place and a column can be read down as well as across; lining figures sit on the baseline at cap height instead of dropping a `3` or a `9` below it the way old-style figures do, so a row of digits reads as one line ([Bringhurst's rule, summarized](https://medium.com/design-bootcamp/the-elements-of-fintech-typography-part-1-readable-money-b6c1226acbde)). A font honors the request only if it has the features; every default above does, and the checklist below catches one that does not.

How it is enforced. Every component's root carries the two utilities and so does every node that prints a number, marked `data-numeric`; a theme adds the same variant to `:root` and to `.tradecn-num, [data-numeric]` for your own markup. The browser matrix then reads the computed style of every element under a tradecn slot whose text holds a digit, in all three consumers and under each theme, and fails the build on the first one that is not lining and tabular. The `format` utility exports the classes for your own cells: `NUMERIC_CLASS`, `MONO_NUMERIC_CLASS`, and `numericFontClass(convention)`, which picks the mono stack for a fraction quote so `99-16+` over `99-17` keeps its dash and its tail in one place, and the numeric family for everything else.

## Character disambiguation

A grid is where `0` meets `O` and `1` meets `l`. The pairs people actually confuse when reading numerals are `3` and `5`, `4` and `6`, `0` and `6`, and a `9` read as `5` or `8`, and they cost more than any aesthetic choice does ([the DOC/NBS numeral legibility study](https://apps.dtic.mil/sti/pdfs/AD0647371.pdf)). The specimen below is set in this page's own font; the live demo above sets it in each recommended family, and the accessibility toggle there shows what a face drawn against these pairs looks like ([Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/)).

<p class="specimen"><span style="font-size: 12px">0O 1lI 5S 8B 69 3-5 4-6 <small>12 px</small></span><br><span style="font-size: 13px">0O 1lI 5S 8B 69 3-5 4-6 <small>13 px</small></span><br><span style="font-size: 14px">0O 1lI 5S 8B 69 3-5 4-6 <small>14 px</small></span></p>

Run a candidate font against this list at 12 px, on the background you ship:

- [ ] `0` and `O` differ by more than width: a slash, a dot, or a clearly narrower zero.
- [ ] `1`, `l`, and `I` are three shapes: a foot or a flag on the `1`, a tail on the `l`, serifs on the `I`.
- [ ] `5` and `S`, `8` and `B` do not read as each other at a glance.
- [ ] `3` and `5` keep their tops apart, and `4` is open so it does not close toward `6`.
- [ ] `6` and `9` have counters that stay open at 12 px, so neither fills toward `0` or `8`.
- [ ] `1,111.11` over `8,888.88` puts the decimal points in one column; if not, the font has no `tnum` and the rule above cannot be honored in it.
- [ ] The digits sit at cap height in a line of capitals; if some drop below the baseline the font has no `lnum`.
- [ ] At weight 500 on your dark background the strokes stay strokes and do not bloom into each other.

## Accessibility mode

Put `data-accessibility="hyperlegible"` on `<html>`, or on any ancestor of the screen that needs it, and `--tradecn-font-sans` becomes `--tradecn-font-accessible` and `--tradecn-font-mono` becomes `--tradecn-font-accessible-mono`. Every tradecn component follows, and so does anything of yours that reads the variables. Load the two faces first; they are the Braille Institute's, drawn for readers with low vision and free to use ([Braille Institute](https://www.brailleinstitute.org/freefont/)).

The remap installs with every item that reads a font token, so it works in a project with no theme. It is unlayered and starts from `:root[data-accessibility="hyperlegible"]`, so it beats the `:root` block that set the tokens when the attribute is on `<html>`. The accessible stacks name their fallbacks in full rather than through `var(--tradecn-font-sans)`, because with the attribute on the root that would be a variable defined in terms of itself, and the browser would drop both.

## What we do not recommend

- **Gill Sans**: it trailed the field in glance legibility, about 20 ms behind the humanist faces ([Sawyer and colleagues, 2020](https://jdobr.es/pdf/Sawyer-etal-2020-Bakeoff.pdf)).
- **Eurostile**: the same study, the same end of the table ([Sawyer and colleagues, 2020](https://jdobr.es/pdf/Sawyer-etal-2020-Bakeoff.pdf)).
- **A geometric sans without a slashed or dotted zero**: `0` and `O` become one shape at grid sizes, and `0` and `6` are already a confusion pair ([the DOC/NBS numeral legibility study](https://apps.dtic.mil/sti/pdfs/AD0647371.pdf)).
- **Hairline weights below 500 on a dark theme**: a thin stroke on black loses to the glow around it, which is why Bloomberg's screen face went heavier on dark ([Bloomberg on its terminal's design](https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/)).
- **Pure `#FFF` on `#000` body text**: the body tokens above ship an off-white on near-black instead; this one is a design preference for long sessions, not a measured finding.

## Sources

Glance legibility

- [Sawyer, Dobres, Chahine, and Reimer, 2020, "The great typography bake-off"](https://jdobr.es/pdf/Sawyer-etal-2020-Bakeoff.pdf)
- [Arditi and Cho, Vision Research, on serifs and letter spacing](https://pmc.ncbi.nlm.nih.gov/articles/PMC4612630/)

Numerals and money

- [Bringhurst's rule on tabular lining figures, summarized for fintech](https://medium.com/design-bootcamp/the-elements-of-fintech-typography-part-1-readable-money-b6c1226acbde)
- [The DOC/NBS numeral legibility study](https://apps.dtic.mil/sti/pdfs/AD0647371.pdf)

Disambiguation and low vision

- [Braille Institute, Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/)

Precedent

- [Bloomberg, how its terminal's designers conceal complexity](https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/)
