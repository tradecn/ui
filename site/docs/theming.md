# Theming

tradecn reads shadcn's palette and adds the tokens a trading screen needs on top of it.

## Tokens

An item adds the tokens its files use to your stylesheet on install, in `:root` and `.dark`. It never overwrites one you already have, so set `--up` and `--down` yourself and every later `shadcn add` leaves them alone. Rule 7 of [the item contract](contract.md) is the promise. The light values are `tradecn-slate`'s light marks and the dark values are tuned for shadcn's near-black, every one at or above 4.5 to 1 on the surface it sits on, and the direction pair is a step apart in lightness in both modes.

{{tokens}}

## Themes

Themes are `cssVars` and the typography base, no files. Each one overwrites every variable, so `--diff` it first. Every theme has a light side and a dark side, switched by your `dark` class. [Color](color.md) has the research behind the choices and a demo that runs every pair through the three kinds of color blindness.

{{themes}}

## Typography

The fonts are tokens too: `--tradecn-font-sans`, `--tradecn-font-mono`, `--tradecn-font-numeric`, and the accessible pair behind `data-accessibility="hyperlegible"`, in the table above with the sizes and weights the research supports. Set them once and every component follows. The one thing that is not a token: any component rendering numeric data MUST set `font-variant-numeric: lining-nums tabular-nums` on the numeric node, and the browser matrix fails a build that does not. [Typography](typography.md) has the defaults, the reasoning behind each, and a checklist for a font of your own.

## Light and dark

The button at the end of the header switches this site between light and dark, and every preview with it; until you press it, the site follows your system. Both sides are `tradecn-amber`, warm paper by day and near-black by night, set in Inter with JetBrains Mono for code, the two faces the typography tokens name. A theme's own preview wears that theme in both.
