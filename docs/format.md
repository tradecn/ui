# format

Number formatting for trading screens: prices by convention, a quote basis per instrument, yields, basis points, DV01, notional, coupons, maturities, ticks, signed values, and one null sentinel.

## Usage

```ts
import { createInstrumentFormatter, formatBps, formatSigned, parsePrice } from "@/lib/format"
```

```ts
const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const bill = createInstrumentFormatter({ price: { kind: "decimal", decimals: 3 }, tick: 0.0005, quoteBasis: "discount" })

ust.price(99.515625) // "99-16+"
parsePrice("99-16+", { kind: "fraction", denominator: 32, half: "+" }) // 99.515625
bill.quote(4.2531) // "4.253"
formatSigned(0.12) // "+0.12"
formatBps(12.5) // "12.5 bp"
```

## API Reference

Pure functions, no React. Every formatter takes `number | null | undefined` and returns `NULL_TOKEN` (an en dash) for null, undefined, NaN, and infinities, so a cell never prints `NaN` while a feed warms up. Negative numbers use the typographic minus (U+2212). The formatters never pad: the figures line up because the node that prints them is set in lining, tabular figures, which every tradecn component does on its own and the classes below do for yours.

### Prices

A `PriceConvention` says how an instrument quotes:

- `{ kind: "decimal", decimals: 2 }` for fixed decimals.
- `{ kind: "tick", tick: 0.005 }` derives the decimals from the tick (`decimalsFromTick(0.005)` is 3) and snaps to the grid.
- `{ kind: "fraction", denominator: 32, half: "+" }` quotes in 32nds: 99.515625 is `99-16+`. `half: "5"` renders `99-165`; `eighths: true` renders eighths of a 32nd as a trailing digit, `99-162`. `denominator: 64` is the same shape in 64ths.

`formatPrice(v, convention)` and `parsePrice(text, convention)` are inverses on the convention's grid; `parsePrice` also accepts a plain decimal, so a ticket can take either. `roundToTick` and `stepByTick` snap and step on the grid without float noise.

`createInstrumentFormatter({ price, tick, yieldDecimals })` binds a convention once; a grid column then calls `formatters[row.instrumentId].price(value)`. Conventions are data, so a new instrument type is a new object, not new code.

### The quote basis

Not every instrument is quoted on its price. Bills quote on a discount rate, some bonds on yield, and credit often on a spread in basis points, and a trader wants to type and read the number in the basis the product trades in. `quoteBasis` on the convention says which (`price` unless said), and three functions follow it: `formatQuote(v, convention)` prints a quote in that basis, `parseQuote(text, convention)` reads one back, and `stepQuote(v, convention, steps)` moves it by its step. A price quote follows its `PriceConvention`; the others print as a fixed decimal with no unit, since the field's label says the basis (`QUOTE_BASIS_LABELS` has the words), and snap to `quoteStep`: the tick for a price, and by default 0.001 for yield and discount and 0.1 for spread, with `quoteDecimals` 3, 3, and 1. Set either on the convention for a desk that steps differently. The instrument formatter carries `basis`, `quoteStep`, `quote`, `parseQuote`, and `stepQuote`. [`ticket`](ticket.md) types through them.

### Coupons, maturities, and millions

`formatCoupon(4.125)` is `4 1/8`, the way a run prints it: coupons step in eighths, so `4.5` is `4 1/2`, `4` is `4`, and one off the grid, `4.1`, prints as the decimal it is. `formatCoupon(v, { style: "decimal" })` is `4.125%`. `formatMaturity("2034-05-15")` is `05/15/34`, or `05/15/2034` with `year: "numeric"`; it reads the date in UTC, so a date-only string is that day on every screen. `daysToMaturity(date, now)` is the whole UTC days between, negative once past, null when the date does not read. `formatNotional(5e6, { unit: "mm" })` is `5mm`, the desk's word for millions, never scaled to billions: `1,250mm`.

### Ticks between two prices

`ticksBetween(a, b, tick)` is how many ticks `a` sits from `b`, signed, to the nearest eighth of a tick: a quote of `99-17` against a composite of `99-16+` on a 1/64 tick is `1`. `formatTicks(n)` prints the count signed and trimmed, `+1`, `−0.5`, `0`, with `unit` for a word after it. Together they say how far a quote is inside or through the market in the instrument's own steps; for a spread quote, `formatBps` does the same job in basis points.

### Numeric classes

`NUMERIC_CLASS` is `font-(family-name:--tradecn-font-numeric) lining-nums tabular-nums`: the numeric family (the sans by default, so letters stay proportional and only the digits take one width) with the figures rule 14 of [the contract](contract.md) requires. `MONO_NUMERIC_CLASS` is the same figures in `--tradecn-font-mono`. `numericFontClass(convention)` picks between them: a fraction price (`99-16+`) sets in the mono stack so its dash and its tail line up down a column, and every other price, and every quote in another basis, keeps the numeric family. [`quote-field`](quote-field.md), [`ticket`](ticket.md), and [`rfq-ticket`](rfq-ticket.md) read it; a [`data-grid`](data-grid.md) column takes `font: "mono"` for the same effect. [`typography.md`](typography.md) has the tokens and the reasoning.

### The rest

`formatYield(4.2531)` is `4.253%`. `formatBps(12.5)` is `12.5 bp`, with `signed` and `unit` options. `formatDv01(1234)` is `$1,234`, `compact` gives `$1.23K`. `formatNotional(1250000, { compact: true })` is `1.25M` (K, M, B, T). `formatSigned(0.12)` is `+0.12`, and zero is `0.00` with no sign: flat carries no sign, the same rule the flash cell uses for direction. `formatPercent`, `formatQuantity` as you would expect. Locale is an option on each (`{ locale: "de-DE" }`), and `Intl.NumberFormat` instances are cached per locale and option set.
