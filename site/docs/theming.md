# Theming

tradecn reads shadcn's palette and adds the tokens a trading screen needs on top of it.

## Tokens

An item adds the tokens its files use to your stylesheet on install, in `:root` and `.dark`. It never overwrites one you already have, so set `--up` and `--down` yourself and every later `shadcn add` leaves them alone. Rule 7 of [the item contract](contract.md) is the promise.

{{tokens}}

## Themes

Two themes, `cssVars` only, no files. Each one overwrites every variable, so `--diff` it first.

{{themes}}

## Light and dark

The button at the end of the header switches this site between light and dark, and every preview with it; until you press it, the site follows your system. Dark is `tradecn-terminal`. Light is shadcn's default light palette under the terminal's monospace stack and square corners, with a deeper amber that reads as text on white and the light values of the tokens above, because both themes are black in either mode. A theme's own preview wears that theme in both.
