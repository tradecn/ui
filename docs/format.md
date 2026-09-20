# format

`npx shadcn add tradecn/ui/format` puts `format.ts` in your `lib` alias. Pure functions, no dependencies, no React.

Every formatter takes `number | null | undefined` and returns `NULL_TOKEN` (an en dash) for null, undefined, NaN, and infinities, so a cell never prints `NaN` while a feed warms up. Negative numbers use the typographic minus (U+2212). Tabular numerals are your CSS (`tabular-nums`); the formatters never pad.

## Prices

A `PriceConvention` says how an instrument quotes:

- `{ kind: "decimal", decimals: 2 }` for fixed decimals.
- `{ kind: "tick", tick: 0.005 }` derives the decimals from the tick (`decimalsFromTick(0.005)` is 3) and snaps to the grid.
- `{ kind: "fraction", denominator: 32, half: "+" }` quotes in 32nds: 99.515625 is `99-16+`. `half: "5"` renders `99-165`; `eighths: true` renders eighths of a 32nd as a trailing digit, `99-162`. `denominator: 64` is the same shape in 64ths.

`formatPrice(v, convention)` and `parsePrice(text, convention)` are inverses on the convention's grid; `parsePrice` also accepts a plain decimal, so a ticket can take either. `roundToTick` and `stepByTick` snap and step on the grid without float noise.

`createInstrumentFormatter({ price, tick, yieldDecimals })` binds a convention once; a grid column then calls `formatters[row.instrumentId].price(value)`. Conventions are data, so a new instrument type is a new object, not new code.

## The rest

`formatYield(4.2531)` is `4.253%`. `formatBps(12.5)` is `12.5 bp`, with `signed` and `unit` options. `formatDv01(1234)` is `$1,234`, `compact` gives `$1.23K`. `formatNotional(1250000, { compact: true })` is `1.25M` (K, M, B, T). `formatSigned(0.12)` is `+0.12`, and zero is `0.00` with no sign: flat carries no sign, the same rule the flash cell uses for direction. `formatPercent`, `formatQuantity` as you would expect. Locale is an option on each (`{ locale: "de-DE" }`), and `Intl.NumberFormat` instances are cached per locale and option set.
