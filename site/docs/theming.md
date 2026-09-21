# Theming

tradecn reads shadcn's palette and adds the tokens a trading screen needs on top of it.

## Tokens

An item adds the tokens its files use to your stylesheet on install, in `:root` and `.dark`. It never overwrites one you already have, so set `--up` and `--down` yourself and every later `shadcn add` leaves them alone. Rule 7 of [the item contract](contract.md) is the promise.

{{tokens}}

## Themes

Two themes, `cssVars` only, no files. Each one overwrites every variable, so `--diff` it first.

{{themes}}
