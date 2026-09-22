# Color

A trading screen asks color to do four jobs: say which way a price moved, tell one feed or one book from another, show how much, and stay readable for a whole session, in daylight and at night. The research settles the first three and leaves the fourth to preference, and it says one thing above all: color is never the only channel. The themes below follow that, and where a choice is taste the sentence says so.

## What the research says

About one man in twelve has a color vision deficiency, and the common kind confuses red with green ([National Eye Institute](https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/color-blindness)). Okabe and Ito put it by population: one in twelve Caucasian men, one in twenty Asian men, and one in twenty-five African men are red-green colorblind, and for them red and green of similar lightness are the hardest pair to tell apart ([Okabe and Ito, Color Universal Design](https://jfly.uni-koeln.de/color/)). The same page gives the palette every theme here draws its direction pair from, vermilion and bluish green among them, and the rule under it: use not only different colors but also different shapes, positions, and patterns.

Red does something to the people who can see it, too. Shown a falling stock in red, investors expected the fall to go on, and shown the same numbers in black or blue they did not; the effect was muted in China, where red means prosperity ([Bazley, Cronqvist, and Mormann, Management Science](https://business.ku.edu/news/article/2021/03/29/color-red-influences-investor-behavior-financial-research-reveals)). That is why a screen for that market shows red for up, and why [`tradecn-slate-east`](tradecn-slate-east.md) exists.

Text needs a contrast ratio of at least 4.5 to 1 against what it sits on, or 3 to 1 at 18 point ([WCAG 2.2, contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)). Every theme here is held to 4.5 to 1 by a test, for every foreground on its surface and every color that carries meaning on the page and on a card, in both modes.

Dark mode is a preference, not a legibility win: in the controlled studies, dark text on a light background won on visual acuity and proofreading across age groups, and the guidance is to let readers switch rather than default the general public to dark ([Nielsen Norman Group](https://www.nngroup.com/articles/dark-mode/)). Traders, by habit, work in the dark. So the themes ship both sides and make the dark side careful: an off-white foreground on a near-black background, never pure white on pure black, which is a design preference for long sessions rather than a measured finding.

A palette that works in light rarely works in dark as it stands; a color scale wants a separate dark version, which is how Radix Colors builds each of its 12-step scales ([Radix Colors, scales](https://www.radix-ui.com/colors/docs/palette-composition/scales)). The two-sided themes here follow that: one hue per token, at the lightness each background needs.

For a quantity rather than a category, a heat map or a depth ladder, use a perceptually uniform ramp such as viridis, which was drawn to read for people with color blindness and to print in grayscale ([the viridis vignette](https://cran.r-project.org/web/packages/viridis/vignettes/intro-to-viridis.html)); a diverging ramp for a signed quantity keeps a light middle and never runs red to green. tradecn ships no chart yet, so these are advice, not tokens.

## The themes

| Theme | Surfaces | Primary | Up | Down | For |
|---|---|---|---|---|---|
| [`tradecn-amber`](tradecn-amber.md) | Warm paper by day, near-black by night | Amber | Blue | Vermilion | The default: the terminal look with a day side, and the strongest separation under every kind of color blindness |
| [`tradecn-slate`](tradecn-slate.md) | Cool near-neutral, two sides | Blue | Bluish green | Vermilion | When the desk expects green for up |
| [`tradecn-slate-east`](tradecn-slate-east.md) | Slate | Blue | Vermilion | Bluish green | Screens for China, Japan, and Taiwan |

Every one has a light side and a dark side, sets every token in both, and appends the typography base. A theme is the only kind of item that overwrites your variables, so `--diff` it first. Two earlier themes, a black terminal with a monospace stack and its green-and-red variant, were removed at 1.0 because the research on this page argues against both: one palette for both modes, a direction pair at equal lightness, and in the variant the one hue pair the common color blindness cannot split.

## The direction pair

The pair in the items' own tokens, and in slate, is Okabe and Ito's bluish green for up and vermilion for down. Amber uses their blue for up instead: blue and vermilion stay furthest apart under protanopia, deuteranopia, and tritanopia, and they differ most in lightness, so the pair reads in grayscale too. East is slate's pair the other way around. So the two halves of "default" differ on purpose: amber is the default theme, the one tradecn.dev wears and the first to install, while a project that installs items and no theme keeps green for up, because that is the habit such a screen is read with, and taking amber is what moves up to blue.

In every theme, and in the items' own defaults, the two colors of a pair are set a step apart in lightness as well as hue, a grayscale ratio of at least 1.3 to 1 that a test holds them to, and both clear 4.5 to 1 on the page and on a card. And in every component, direction never rides on the hue alone: a signed number prints its sign, a flash cell carries `data-direction`, a sparkline says its direction in words to a screen reader, a ticket's side button says Buy or Sell. That is rule 15 of [the item contract](contract.md), and a test lists every file that colors by direction and the other channel it uses. The demo above runs each theme's pair through the three kinds of color blindness and through grayscale, so you can see what survives.

## Light and dark are two palettes

Every theme has one palette for each side, switched by the `dark` class the way shadcn switches its own. A token such as `up` has a light value tuned for white and a dark value tuned for near-black, and the soft tints behind a flash are 18 percent of the mark over whichever background is showing. The items' own defaults are built the same way: their light marks are slate's, every one at or above 4.5 to 1 on white, and their dark marks are tuned for shadcn's near-black. Your own `--up` survives a later install of any item; only a theme replaces it.

## What we do not recommend

- **Pure red beside pure green at the same lightness**: the pair the common kind of color blindness cannot split ([Okabe and Ito](https://jfly.uni-koeln.de/color/)).
- **Direction by hue alone**: a sign, an arrow, or a word goes with it, always ([Okabe and Ito](https://jfly.uni-koeln.de/color/)).
- **A rainbow ramp for magnitude**: a perceptually uniform ramp reads in order and in grayscale, a rainbow does neither ([the viridis vignette](https://cran.r-project.org/web/packages/viridis/vignettes/intro-to-viridis.html)).
- **One palette for both modes**: the dark side wants its own values ([Radix Colors](https://www.radix-ui.com/colors/docs/palette-composition/scales)).
- **Pure white on pure black**: the two-sided themes sit at `oklch(0.95)` on `oklch(0.16)` instead; a design preference for long sessions, not a measured finding.

## What the research does not settle

No study measures eye strain across trading-screen palettes over a full session; the polarity findings above are the nearest thing. And that traders prefer dark screens is preference data, not performance data. Both are stated here so the pages do not claim more than they know.

## Sources

Color vision

- [Okabe and Ito, Color Universal Design](https://jfly.uni-koeln.de/color/)
- [National Eye Institute, color blindness](https://www.nei.nih.gov/learn-about-eye-health/eye-conditions-and-diseases/color-blindness)

Behavior and convention

- [Bazley, Cronqvist, and Mormann, "Visual Finance: The Pervasive Effects of Red on Investor Behavior", as reported by the University of Kansas](https://business.ku.edu/news/article/2021/03/29/color-red-influences-investor-behavior-financial-research-reveals)

Contrast and mode

- [WCAG 2.2, Understanding Success Criterion 1.4.3, contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [Nielsen Norman Group, dark mode versus light mode](https://www.nngroup.com/articles/dark-mode/)

Palettes and ramps

- [Radix Colors, scales](https://www.radix-ui.com/colors/docs/palette-composition/scales)
- [The viridis vignette](https://cran.r-project.org/web/packages/viridis/vignettes/intro-to-viridis.html)
