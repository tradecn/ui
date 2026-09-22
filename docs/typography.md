# Typography

Set font families through CSS variables and load the fonts in your app. The registry bundles no font files. Components use the family tokens below; sizes, line heights, and weights remain component styles.

## Bring your own font

Set your stacks after the installed token declarations so they apply in both modes:

```css
:root, .dark {
  --tradecn-font-sans: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
  --tradecn-font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

`--tradecn-font-numeric` defaults to `var(--tradecn-font-sans)`. Point it at `var(--tradecn-font-mono)` if you want grid numbers in the mono family. Themes use the same family defaults and leave your app's `--font-sans` alone.

To make Tailwind's `font-sans` and `font-mono` utilities follow these tokens, including accessibility mode:

```css
@theme inline {
  --font-sans: var(--tradecn-font-sans);
  --font-mono: var(--tradecn-font-mono);
}
```

Load whichever families you choose. The default Inter and JetBrains Mono families are free to use; this [Google Fonts CSS request](https://developers.google.com/fonts/docs/css2) loads both variable weight ranges:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@100..800&display=swap">
```

For self-hosting, [Fontsource](https://fontsource.org/docs/getting-started/install) offers static packages with one import per weight, such as `@fontsource/inter/500.css` and `@fontsource/jetbrains-mono/500.css`. The playground and tradecn.dev self-host these fonts; previews make no third-party font requests.

Fontsource's `@fontsource-variable/inter` registers the family as `'Inter Variable'`. If that is what your app loads, use `'Inter', 'Inter Variable', ui-sans-serif, system-ui, sans-serif` or set `--tradecn-font-sans: var(--font-sans)` when the app already defines its stack. Do not combine the latter with the Tailwind alias above: the two variables would refer to each other.

## Defaults

- **Inter** for prose, labels, and grid numbers. Its [tabular figures](https://rsms.me/inter/) let digits share a width while letters stay proportional.
- **JetBrains Mono** for code, order IDs, timestamps, and fraction quotes such as `99-16+`. It has a dotted zero and distinct `1`, `l`, and `I` shapes ([JetBrains](https://www.jetbrains.com/lp/mono/)). [IBM Plex Mono](https://www.ibm.com/plex/plexness/) is another option.
- **Atkinson Hyperlegible Next** and **Atkinson Hyperlegible Mono** for accessibility mode. The [Braille Institute](https://www.brailleinstitute.org/freefont/) designed the family to distinguish similar characters for readers with low vision.

### Tokens

An item installs the tokens its source uses, their dependencies, and the accessible pair when it uses a font token. Non-theme installs add missing values to `:root` and `.dark`. Theme installs replace existing values and supply the full set below.

Size, line-height, weight, and body-color tokens are available for your own stylesheet. Setting a size token does not resize a component. Every grid preset uses `text-xs` (12 px with the default 16 px root size). The registry validator rejects explicit source sizes below 12 px; this is a source check, not a browser minimum under consumer CSS.

| Token | Default | Purpose |
|---|---|---|
| `--tradecn-font-sans` | `'Inter', ui-sans-serif, system-ui, sans-serif` | Prose, labels, chrome |
| `--tradecn-font-mono` | `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | Code, IDs, timestamps, fraction quotes |
| `--tradecn-font-numeric` | `var(--tradecn-font-sans)` | Grid numbers |
| `--tradecn-font-accessible` | `'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', ui-sans-serif, system-ui, sans-serif` | Accessible sans stack |
| `--tradecn-font-accessible-mono` | `'Atkinson Hyperlegible Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | Accessible mono stack |
| `--tradecn-text-size-body` | `14px` | Suggested body size; maximum default body token value |
| `--tradecn-text-size-grid` | `13px` | Suggested grid size |
| `--tradecn-text-size-grid-min` | `12px` | Registry source size floor |
| `--tradecn-line-height-body` | `1.45` | Unitless body line height |
| `--tradecn-line-height-grid` | `1.35` | Unitless grid line height |
| `--tradecn-font-weight-body` | `450` | Suggested body weight |
| `--tradecn-font-weight-grid` | `500` | Suggested grid weight, in both modes |
| `--tradecn-numeric-variant` | `lining-nums tabular-nums` | Required numeric variant |
| `--tradecn-color-body-fg` | `oklch(0.96 0 0)` dark, `oklch(0.2 0 0)` light | Body foreground |
| `--tradecn-color-body-bg` | `oklch(0.14 0 0)` dark, `oklch(0.98 0 0)` light | Body background |

## Accessibility mode

Load Atkinson Hyperlegible Next and Mono, then put `data-accessibility="hyperlegible"` on `<html>`:

```html
<html data-accessibility="hyperlegible">
```

The remap sets `--tradecn-font-sans` to `var(--tradecn-font-accessible)` and `--tradecn-font-mono` to `var(--tradecn-font-accessible-mono)`. It ships with every item that uses a font token, so no theme is required. It also reaches your own text wherever you use those families.

The fonts are free from the [Braille Institute](https://www.brailleinstitute.org/freefont/), Google Fonts, and Fontsource (`@fontsource/atkinson-hyperlegible-next`, `@fontsource/atkinson-hyperlegible-mono`). The mode changes font selection; it does not load the fonts.

You can scope the attribute to an ancestor of one screen. To make numeric text follow a scoped sans change, redeclare the numeric alias on that ancestor too:

```css
[data-accessibility="hyperlegible"] {
  --tradecn-font-numeric: var(--tradecn-font-sans);
}
```

An inherited numeric alias has already resolved against its ancestor's sans value. An explicitly chosen numeric family also stays unchanged unless you override it. [CSS custom properties resolve before inheritance](https://www.w3.org/TR/css-variables-1/#using-variables).

The installed remap is unlayered and includes `:root[data-accessibility="hyperlegible"]` so it overrides ordinary root token declarations. Keep accessible stacks independent of the sans and mono tokens: a reference back to the token being remapped creates a cycle.

## Numeric rendering

Any component rendering numeric data MUST set `font-variant-numeric: lining-nums tabular-nums` on the numeric node. This is rule 14 of [the item contract](contract.md); the numeric variant is fixed even when you change families.

Tabular figures have equal digit widths, so equally formatted values such as `1,111.11` and `8,888.88` align. Lining figures have a uniform height and baseline, unlike old-style figures with ascenders and descenders. CSS requests the font's numeric features; it cannot supply missing glyph designs ([CSS Fonts](https://www.w3.org/TR/css-fonts-4/#font-variant-numeric-prop)). A font may already have the required figures by default without a separate `tnum` or `lnum` substitution.

Use the [format helpers](format.md) in your own cells:

| Export | Family and behavior |
|---|---|
| `NUMERIC_CLASS` | Numeric family with lining, tabular figures |
| `MONO_NUMERIC_CLASS` | Mono family with lining, tabular figures |
| `numericFontClass(convention)` | Mono for a fraction price, such as `99-16+`; numeric for other prices and non-price quote bases |

Monospacing gives digits, separators, and suffixes equal widths. Quotes such as `99-16+` and `99-17` still need padding or separate alignment if their optional suffixes must line up.

UI items and blocks set the numeric utilities on their roots. Themes add the variant on `:root` and `.tradecn-num, [data-numeric]` for consumer markup.

The three-consumer browser matrix checks computed numeric styles on nodes with digits or numeric input values under tradecn slots, plus nodes marked `data-numeric`. Theme tests also check their numeric base styles. These checks verify the CSS request, not the font's actual glyph shapes; use the specimen below to check those.

## Character disambiguation

Compare a candidate font at 12, 13, and 14 px on the background you ship. The specimen uses this page's font. The live demo on tradecn.dev compares the sans and mono stacks with Georgia and offers an accessibility toggle.

<p class="specimen"><span style="font-size: 12px">0O 1lI 5S 8B 69 3-5 4-6 <small>12 px</small></span><br><span style="font-size: 13px">0O 1lI 5S 8B 69 3-5 4-6 <small>13 px</small></span><br><span style="font-size: 14px">0O 1lI 5S 8B 69 3-5 4-6 <small>14 px</small></span></p>

The [NBS handbook](https://nvlpubs.nist.gov/nistpubs/Legacy/MP/nbsmiscellaneouspub262-2.pdf) summarizes confusions such as `3`/`5` and `4`/`6` in experiments on dimly lit numeral displays (pp. 98–100). Those results depend on the designs and viewing conditions; they do not rank current fonts.

Use this checklist at 12 px, with the intended font loaded:

- [ ] `0` and `O` are distinct: a slash, a dot, or a clearly narrower zero can help.
- [ ] `1`, `l`, and `I` have distinct shapes, such as a foot or flag on `1`, a tail on `l`, and serifs on `I`.
- [ ] `5` and `S`, and `8` and `B`, remain distinguishable at a glance.
- [ ] `3` and `5` have distinct tops; `4` does not close toward `6`.
- [ ] The spaces inside `6` and `9` stay clear so neither fills toward `0` or `8`.
- [ ] `1,111.11` above `8,888.88` aligns the decimal points with the numeric variant applied.
- [ ] Digits have a consistent height and baseline alongside capitals.
- [ ] At weight 500 on your dark background, strokes stay distinct.

If alignment or shapes fail, check the loaded family, fallbacks, and computed styles before blaming missing OpenType features. Inter's optional disambiguation alternates are separate from tabular figures; the numeric rule does not enable them.

## What we do not recommend

- **Gill Sans or Eurostile as a first choice for glance reading.** In Sawyer and colleagues' study, Frutiger and FF Meta had the lowest mean display-time thresholds; Gill Sans and Eurostile had the highest. The extremes differed by about 20 ms. This was a word/pseudoword task with 73 adults and white text on black, not a trading-grid test, and it did not include Inter ([2020 paper](https://jdobr.es/pdf/Sawyer-etal-2020-Bakeoff.pdf)).
- **A face whose characters fail the checklist.** A geometric classification or an unslashed zero alone does not establish poor legibility.
- **Very thin strokes for dense dark screens.** Start with the suggested grid weight of 500 and judge the loaded font at its actual size. This is a design choice, not a universal weight threshold.
- **Pure `#FFF` on `#000` body text.** The body tokens and dark themes use off-white on near-black. This is a preference for long sessions, not a measured finding about fatigue.

A serif face your firm licenses can still be a candidate. Arditi and Cho found no reading-speed effect from adding serifs to their controlled fonts; small size-threshold effects could be explained by spacing. That does not rank all serif and sans families or establish a general reading-speed advantage for wider spacing ([study](https://pmc.ncbi.nlm.nih.gov/articles/PMC4612630/)).

## Sources

Research

- [Sawyer, Dobres, Chahine, and Reimer, 2020, "The great typography bake-off"](https://jdobr.es/pdf/Sawyer-etal-2020-Bakeoff.pdf): glance thresholds for eight sans-serif faces.
- [Arditi and Cho, "Serifs and font legibility"](https://pmc.ncbi.nlm.nih.gov/articles/PMC4612630/): controlled serif and spacing experiments.
- [NBS, "Legibility of Alphanumeric Characters and Other Symbols: II. A Reference Handbook"](https://nvlpubs.nist.gov/nistpubs/Legacy/MP/nbsmiscellaneouspub262-2.pdf), also [archived by DTIC](https://apps.dtic.mil/sti/pdfs/AD0647371.pdf): a collection of earlier reports, not one numeral experiment.

Font documentation

- [Inter](https://rsms.me/inter/), [JetBrains Mono](https://www.jetbrains.com/lp/mono/), and [Braille Institute's Atkinson Hyperlegible family](https://www.brailleinstitute.org/freefont/).
- [CSS Fonts: numeric variants](https://www.w3.org/TR/css-fonts-4/#font-variant-numeric-prop), [Google Fonts CSS API](https://developers.google.com/fonts/docs/css2), and [Fontsource setup](https://fontsource.org/docs/getting-started/install).

Further reading

- [A fintech typography article summarizing Bringhurst's guidance](https://medium.com/design-bootcamp/the-elements-of-fintech-typography-part-1-readable-money-b6c1226acbde), a secondary source.
- [Bloomberg, how its terminal's designers conceal complexity](https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/), a design-history reference.
