# Theming

tradecn reads shadcn's palette and adds the tokens a trading screen needs on top of it.

## Tokens

An item adds the tokens its files use to your stylesheet on install, in `:root` and `.dark`. It never overwrites one you already have, so set `--up` and `--down` yourself and every later `shadcn add` leaves them alone. Rule 7 of [the item contract](contract.md) is the promise.

{{tokens}}

## Themes

Two themes, `cssVars` only, no files. Each one overwrites every variable, so `--diff` it first.

{{themes}}

## Typography

The fonts are tokens too: `--tradecn-font-sans`, `--tradecn-font-mono`, `--tradecn-font-numeric`, and the accessible pair behind `data-accessibility="hyperlegible"`, in the table above with the sizes and weights the research supports. Set them once and every component follows. The one thing that is not a token: any component rendering numeric data MUST set `font-variant-numeric: lining-nums tabular-nums` on the numeric node, and the browser matrix fails a build that does not. [Typography](typography.md) has the defaults, the reasoning behind each, and a checklist for a font of your own.

## Light and dark

The button at the end of the header switches this site between light and dark, and every preview with it; until you press it, the site follows your system. Dark is `tradecn-terminal`. Light is shadcn's default light palette under the terminal's monospace stack and square corners, with a deeper amber that reads as text on white and the light values of the tokens above, because both themes are black in either mode. A theme's own preview wears that theme in both.
