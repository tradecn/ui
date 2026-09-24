# Color

Use color for direction, category, and quantity, with visible signs, labels, or shapes carrying the same meaning. tradecn's themes provide separate light and dark palettes. Choose the direction convention your desk expects; the research below informs those choices without establishing one best palette for every reader or a full trading session.

## What the research says

About one man in twelve has a color vision deficiency, and the common kind makes red and green harder to distinguish ([National Eye Institute](https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/color-blindness)). Okabe and Ito report red-green deficiency in about one in twelve Caucasian men, one in twenty Asian men, and one in twenty-five African men. They warn about red and green of similar lightness and recommend combining color with shapes, positions, and patterns ([Color Universal Design](https://jfly.uni-koeln.de/color/)). The direction colors here adapt their palette, including blue, bluish green, and vermilion.

Color also affects interpretation. Bazley, Cronqvist, and Mormann found effects of red on risk preferences, return expectations, and trading decisions across eight experiments, with muted effects in China, where red is associated with prosperity ([paper](https://pubsonline.informs.org/doi/10.1287/mnsc.2020.3747)). The [university summary](https://business.ku.edu/news/article/2021/03/29/color-red-influences-investor-behavior-financial-research-reveals) describes more persistent pessimism about falling stocks when the information was red rather than black or blue. This supports considering the audience's associations; it does not explain the origin of a market convention. [`tradecn-slate-east`](tradecn-slate-east.md) documents red-for-up examples in mainland China, Japan, and Taiwan.

[WCAG 2.2's contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) is 4.5 to 1 for ordinary text, or 3 to 1 for large text: at least 18 point, or 14 point bold. `scripts/themes.test.ts` checks these narrower sets at 4.5 to 1 in both modes:

| Check | Coverage |
|---|---|
| Text | The 13 declared foreground/surface pairs, including page, card, popover, button, muted, accent, and sidebar text. |
| Marks | `primary`, `up`, `down`, `stale`, `expiring`, `link-1` through `link-4`, `panel-sync`, `destructive`, and `ring`, each on the background and card. |
| Tints | Foreground text over `up-soft`, `down-soft`, `flat-soft`, `stale-soft`, and `expiring-soft`, composited on the page by the test's luminance calculation. |

These calculations do not check every component state, chart color, or consumer override. Check the rendered combinations your app uses.

Dark mode is not a general legibility advantage. [Piepenbrock and colleagues](https://pubmed.ncbi.nlm.nih.gov/23654206/) found better visual acuity and proofreading with dark text on a light background in both younger and older adults. That study does not establish which trading palette is most comfortable over a full session. Let readers choose their mode; both palettes are included here.

[Radix Colors](https://www.radix-ui.com/colors/docs/palette-composition/scales) provides separate light and dark versions of its 12-step color scales. tradecn similarly adjusts the marks' lightness for each background while keeping their hue close across modes.

For categories such as chart overlays, the item defaults for `chart-1` through `chart-8` adapt Okabe and Ito's orange, sky blue, bluish green, yellow, blue, vermilion, reddish purple, and black, with the page's foreground standing in for black. An item installs the tokens it uses and preserves existing values, including a shadcn project's first five chart colors; a theme sets all eight with its own assignments. [`price-chart`](price-chart.md) uses these tokens and prints overlay labels beside colored dots. Matching a legend entry to its line still depends on color; a named legend alone does not provide a distinct visible pattern for each line.

For magnitude, use a perceptually uniform ramp such as viridis, designed for common color vision deficiencies and an ordered grayscale conversion ([the viridis vignette](https://cran.r-project.org/web/packages/viridis/vignettes/intro-to-viridis.html)). A signed quantity can use a diverging ramp around a meaningful midpoint: commonly light in a light palette, or dark in a dark palette ([Matplotlib's colormap guidance](https://matplotlib.org/stable/users/explain/colors/colormaps.html)). Avoid relying on a red/green distinction. tradecn ships no heat map or magnitude-ramp token; [`depth-ladder`](depth-ladder.md) prints numeric sizes in separate Bid and Ask columns.

## The themes

| Theme | Surfaces | Primary | Up | Down | For |
|---|---|---|---|---|---|
| [`tradecn-amber`](tradecn-amber.md) | Warm paper by day, near-black by night | Amber | Blue | Vermilion | The site's default: the terminal look with a day side |
| [`tradecn-slate`](tradecn-slate.md) | Cool near-neutral, two sides | Blue | Bluish green | Vermilion | Desks that expect green for up |
| [`tradecn-slate-east`](tradecn-slate-east.md) | Slate | Blue | Vermilion | Bluish green | Desks that expect red for up |

Each theme sets every tradecn token in both modes, replaces the palette variables, and resets tradecn's typography tokens to their defaults. It also adds the numeric base rules and accessible-font remap described in [Typography](typography.md). A theme enables variable overwrites for the install, so inspect `--diff` first and commit your stylesheet before installing. Themes add no runtime mode switcher.

The black, monospace `tradecn-terminal` and its green/red variant, `tradecn-terminal-classic`, were removed at 1.0. They reused one palette in both modes; the original terminal also gave up and down the same OKLCH lightness. Existing installations keep their stylesheet values until you replace them.

## The direction pair

Items installed without a theme use bluish green for up and vermilion for down. Their light marks match Slate; their dark marks are tuned for shadcn's surfaces and differ from Slate's. Amber is tradecn.dev's default theme and changes up to blue when installed. East swaps Slate's up/down colors and soft tints. These are direction conventions, not judgments about whether a move benefits a position.

Tests require at least 1.3 to 1 between up and down using the repository's luminance calculation. The current ratios are:

| Palette | Light | Dark |
|---|---|---|
| Amber | 1.45 to 1 | 1.33 to 1 |
| Slate and Slate East | 1.54 to 1 | 1.72 to 1 |
| Item defaults | 1.54 to 1 | 1.56 to 1 |

These gaps do not guarantee distinguishability in print or with color vision deficiencies. All are below the 3 to 1 threshold for lightness as an additional visual distinction in [WCAG's use-of-color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html). Both direction colors separately clear 4.5 to 1 on each theme's page and card; the item defaults are tested on shadcn's reference surfaces.

Keep direction visible in a sign, arrow, or word. A ticket's side button says Buy or Sell; the default noninteractive sparkline includes its direction in its accessible name when it has data. A flash cell exposes `data-direction`, but its displayed content is caller-supplied: pair an absolute price with a signed change or another visible direction cue. A DOM attribute or screen-reader description alone does not provide that visible cue.

Rule 15 of [the item contract](contract.md) requires another channel alongside direction color. `scripts/color.test.ts` inventories source files using direction tokens and looks for each declared channel's source pattern. It does not prove that every rendered use supplies an adequate visual alternative. The demo above compares all three themes in both modes, with signed direction labels and separate status words. Its copyable source includes the six palette values each swatch uses; no repository data file is needed. Scroll the comparison horizontally on a narrow screen.

The protanopia, deuteranopia, and tritanopia views apply [Machado, Oliveira, and Fernandes's matrices](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html) at severity one in linear RGB; grayscale uses the browser's CSS filter. These views help spot potential confusion. They do not reproduce every reader's vision, establish accessibility, or replace testing with readers.

## Light and dark are two palettes

Your app controls the `dark` class to select a theme's palette. The up/down marks keep their hue while changing lightness for the background. `up-soft`, `down-soft`, and `expiring-soft` use 18 percent opacity, `stale-soft` uses 16 percent, and `flat-soft` uses 14 percent. A tint blends with the surface underneath it.

The items' default light marks (`up`, `down`, `stale`, `expiring`, `panel-sync`, and the four `link-*` colors) match Slate's and clear 4.5 to 1 on white and `oklch(0.97 0 0)`. Their dark counterparts are tested on shadcn's `oklch(0.145 0 0)` background and `oklch(0.205 0 0)` card. Installing an item without a theme preserves your existing `--up`; installing a theme replaces it.

## What we do not recommend

- **Red and green of similar lightness as the only distinction**: these can be hard to distinguish with common color vision deficiencies ([Okabe and Ito](https://jfly.uni-koeln.de/color/)).
- **Direction by hue alone**: add a visible sign, arrow, or word ([WCAG, use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)).
- **A rainbow ramp for magnitude**: uneven lightness can create apparent boundaries and obscure the order in grayscale ([the viridis vignette](https://cran.r-project.org/web/packages/viridis/vignettes/intro-to-viridis.html)).
- **Reusing a palette without checking the other mode**: evaluate contrast against each background ([Radix Colors](https://www.radix-ui.com/colors/docs/palette-composition/scales)).
- **Pure white on pure black as tradecn's default**: the dark themes use off-white on near-black. Slate's foreground/background OKLCH lightness values are 0.95/0.16; Amber's are 0.94/0.14. This is a design preference, not a measured reduction in eye strain.

## What the research does not settle

The cited studies do not compare these trading-screen palettes over a full session or establish a trader-wide preference for dark mode. The palette adaptations, warm versus cool surfaces, and off-white text on near-black remain design choices. Validate readability, visible direction cues, and mode preferences with the people using your screen.

## Sources

Color vision

- [Okabe and Ito, Color Universal Design](https://jfly.uni-koeln.de/color/)
- [National Eye Institute, color blindness](https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/color-blindness)

Behavior and convention

- [Bazley, Cronqvist, and Mormann, "Visual Finance: The Pervasive Effects of Red on Investor Behavior"](https://pubsonline.informs.org/doi/10.1287/mnsc.2020.3747)
- [The University of Kansas summary of Visual Finance](https://business.ku.edu/news/article/2021/03/29/color-red-influences-investor-behavior-financial-research-reveals)

Contrast and mode

- [WCAG 2.2, Understanding Success Criterion 1.4.3, contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [WCAG 2.2, Understanding Success Criterion 1.4.1, use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- [Piepenbrock and colleagues, "Positive display polarity is advantageous for both younger and older adults"](https://pubmed.ncbi.nlm.nih.gov/23654206/)
- [Nielsen Norman Group, dark mode versus light mode, a research overview](https://www.nngroup.com/articles/dark-mode/)

Palettes and ramps

- [Radix Colors, scales](https://www.radix-ui.com/colors/docs/palette-composition/scales)
- [The viridis vignette](https://cran.r-project.org/web/packages/viridis/vignettes/intro-to-viridis.html)
- [Matplotlib, choosing colormaps](https://matplotlib.org/stable/users/explain/colors/colormaps.html)
