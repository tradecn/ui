# format

Format trading values and parse or step quotes in each instrument's convention.

## Usage

Bind the instrument's convention once, then format, parse, and step prices through the same formatter.

```ts
import { createInstrumentFormatter } from "@/lib/format"

const ust = createInstrumentFormatter({
  price: { kind: "fraction", denominator: 32, half: "+" },
  tick: 1 / 64,
})

ust.price(99.515625) // "99-16+"
ust.parsePrice("99-17") // 99.53125
ust.price(ust.step(99.5, 1)) // "99-16+"
```

The preview groups quote conventions, instrument details, and scalar values. It uses the default `en-US` locale; yield, discount, and percent inputs are percentage points, and `mm` means millions.

## API Reference

Pure functions with no React dependency. Numeric formatters accept `Nullable` (`number | null | undefined`) and return `NULL_TOKEN` (`–`, an en dash) for null, undefined, NaN, and infinities. Negative numeric output uses the typographic minus (`−`, U+2212).

`Locale` is `{ locale?: string }`, with `"en-US"` as the default. Decimal and date output can use another locale, such as `{ locale: "de-DE" }`; fraction notation stays fixed. Parsing is not locale-aware: `parsePrice` and `parseQuote` accept a decimal point, remove commas, trim whitespace, and accept either minus sign.

### Prices

`PriceConvention` selects the notation and precision. Fields below are required unless marked optional.

| `kind` | Fields | Formatting |
|---|---|---|
| `"decimal"` | `decimals: number` | Fixed decimal places; `1234.5` with `decimals: 2` is `1,234.50` |
| `"tick"` | `tick: number` | Snap to the tick grid and derive decimal places from the tick; `100.0049` with `tick: 0.005` is `100.005` |
| `"fraction"` | `denominator: 32 \| 64`, `half: "+" \| "5"`, optional `eighths: boolean` (default `false`) | Round to halves of a 32nd or 64th, or eighths when enabled |

In 32nds, `99.515625` prints as `99-16+`, or `99-165` with `half: "5"`. With `eighths: true`, the trailing digit counts eighths: `99.5078125` is `99-162` and `99.515625` is `99-164`. A denominator of 64 uses the same notation in 64ths.

| Function | Result |
|---|---|
| `formatPrice(value, convention, locale?)` | Format a `Nullable` price; the third argument is a `Locale` object |
| `formatFraction(value, convention)` | Format a `Nullable` price with the fraction variant of `PriceConvention` |
| `parsePrice(text, convention)` | Read a string in the convention's notation or as a plain decimal; return a number or `null` for unreadable text |
| `decimalsFromTick(tick, max = 8)` | Decimal places needed for a numeric tick, capped at `max`; `0.005` gives `3`, `1 / 32` gives `5`; nonpositive or nonfinite ticks give `0` |
| `roundToTick(value, tick)` | Snap a number to the nearest tick and clean float noise; return `value` unchanged if it or the tick is nonfinite, or the tick is nonpositive |
| `stepByTick(value, tick, steps)` | Snap to the grid, move by `steps` ticks, then snap again; all inputs are numbers and negative steps are allowed |

`parsePrice` rounds decimal input to `decimals` for a decimal convention and snaps it to `tick` for a tick convention. For a fraction convention, plain decimal input is accepted without snapping. With the default locale, formatted prices read back on the convention's representable grid.

### Instrument formatter

`createInstrumentFormatter(convention, locale?)` binds an `InstrumentConvention` and optional `Locale` once. A grid column can then call `formatters[row.instrumentId].price(value)`; a new instrument convention is another data object.

| `InstrumentConvention` field | Type | Default | Purpose |
|---|---|---|---|
| `price` | `PriceConvention` | Required | Price notation |
| `tick` | `number` | Required | Price increment for stepping |
| `yieldDecimals` | `number` | `3` | Decimal places for the bound `yield` formatter |
| `quantityUnit` | `"notional" \| "contracts"` | Unset | Metadata; the bound `quantity` formatter always prints whole quantities |
| `quoteBasis` | `QuoteBasis` | `"price"` | Basis used by quote methods |
| `quoteStep` | `number` | Basis default below | Step for yield, discount, or spread quotes; ignored for price quotes |
| `quoteDecimals` | `number` | Basis default below | Decimal places for yield, discount, or spread quotes; ignored for price quotes |

| Bound member | Equivalent |
|---|---|
| `tick`, `basis`, `quoteStep` | `convention.tick`, `quoteBasisOf(convention)`, `quoteStepOf(convention)` |
| `price(value)`, `parsePrice(text)` | `formatPrice` and `parsePrice` with `convention.price` |
| `yield(value)` | `formatYield` with `yieldDecimals` |
| `quantity(value)` | `formatQuantity` |
| `step(value, steps)` | `stepByTick` with `convention.tick` |
| `quote(value)`, `parseQuote(text)`, `stepQuote(value, steps)` | Quote functions below with the bound convention |

### The quote basis

`QuoteBasis` says what the trader types and reads. Bills quote on discount, some bonds on yield, and credit often on spread. [`ticket`](ticket.md)'s quote field uses these quote functions.

| Basis | Default step | Default decimals | `QUOTE_BASIS_LABELS` |
|---|---|---|---|
| `"price"` | `convention.tick` | From `convention.price` | `"Price"` |
| `"yield"` | `0.001` | `3` | `"Yield"` |
| `"discount"` | `0.001` | `3` | `"Discount"` |
| `"spread"` | `0.1` | `1` | `"Spread"` |

| Function | Result |
|---|---|
| `quoteBasisOf(convention)` | Effective basis, defaulting to `"price"` |
| `quoteStepOf(convention)` | Effective step from the table or an applicable `quoteStep` override |
| `formatQuote(value, convention, locale?)` | Format a `Nullable` quote; optional third argument is `Locale` |
| `parseQuote(text, convention)` | Parse a string as a price or a decimal in the selected basis; return a number or `null` for unreadable text |
| `stepQuote(value, convention, steps)` | Move a numeric quote by `steps` from the nearest grid value; negative steps are allowed |

Price quotes format and parse through `convention.price`. Other bases snap to `quoteStep` and print a fixed decimal with no unit; the field's label supplies the basis. Yield and discount values use percentage points; spread values use basis points. Set `quoteDecimals` high enough to display the chosen step without losing precision.

### Coupons, maturities, and millions

| Function | Inputs and options | Example output |
|---|---|---|
| `formatCoupon(value, options?)` | `Nullable`; `style: "fraction" \| "decimal"` (default `"fraction"`), `decimals: number` (default `3`), `locale` | `4.125` → `4 1/8`; decimal style → `4.125%` |
| `formatMaturity(date, options?)` | `DateLike \| null \| undefined`; `year: "2-digit" \| "numeric"` (default `"2-digit"`), `locale` | `"2034-05-15"` → `05/15/34`; numeric year → `05/15/2034` |
| `daysToMaturity(date, now?)` | `DateLike \| null \| undefined`; `now: DateLike` defaults to the current time | Whole UTC calendar days to maturity; `0` on the same day, negative on later days, `null` if either date is invalid |
| `formatNotional(value, { unit: "mm" })` | `Nullable`; optional `decimals: number` (default `2`) and `locale` | `5e6` → `5mm`; `1.25e9` → `1,250mm` |

Fraction coupons reduce eighths: `4.5` is `4 1/2` and `4` is `4`. Values off the eighths grid use up to `decimals` places, so `4.1` stays `4.1`; decimal style always uses fixed places and a `%` suffix. The `mm` notional unit means millions, trims trailing zeros, and takes precedence over `compact` without scaling to billions.

`DateLike` is `Date | number | string`: a date, milliseconds since the Unix epoch, or a string `Date` can read. Maturities format in UTC, so a date-only string stays on the same day in every timezone. `formatMaturity` returns `NULL_TOKEN` for missing or invalid dates.

### Ticks between two prices

| Function | Inputs and options | Result |
|---|---|---|
| `ticksBetween(a, b, tick)` | Three numbers | `(a - b) / tick`, rounded to the nearest eighth; `NaN` if either price is nonfinite or `tick > 0` is false |
| `formatTicks(value, options?)` | `Nullable`; `signed: boolean` (default `true`), `unit: string` (default none), `locale` | Up to three decimals, no trailing zeros: `+1`, `−0.5`, `0`; a unit adds a space and suffix, such as `+2 ticks` |

A quote of `99-17` against a composite of `99-16+` on a `1 / 64` tick is one tick: `ticksBetween(99.53125, 99.515625, 1 / 64)` returns `1`. Use `formatBps` for spread differences in basis points.

### Numeric classes

Formatters add no alignment spaces. tradecn components set lining, tabular figures on numeric nodes; use these classes on your own nodes to meet rule 14 of [the contract](contract.md).

| Export | Value or behavior |
|---|---|
| `NUMERIC_CLASS` | `font-(family-name:--tradecn-font-numeric) lining-nums tabular-nums` |
| `MONO_NUMERIC_CLASS` | `font-(family-name:--tradecn-font-mono) lining-nums tabular-nums` |
| `numericFontClass(convention?)` | Accepts `PriceConvention \| InstrumentConvention \| null`; selects mono for a fraction price and the numeric family otherwise, including non-price quote bases and no convention |

The numeric family defaults to sans: letters stay proportional and digits have equal widths. Fraction prices use mono so dashes and tails align too. [`quote-field`](quote-field.md), [`ticket`](ticket.md), and [`rfq-ticket`](rfq-ticket.md) use `numericFontClass`; a [`data-grid`](data-grid.md) column uses `numeric: true` and `font: "mono"` for the same effect. [`typography.md`](typography.md) explains the tokens and choices.

### The rest

These functions take a `Nullable` value and an optional options object. Every options object accepts `locale`; examples use `"en-US"`.

| Function | Options and defaults | Example output |
|---|---|---|
| `formatYield` | `decimals: number = 3`, `suffix: "%" \| "" = "%"` | `4.2531` → `4.253%` |
| `formatBps` | `decimals: number = 1`, `signed: boolean = false`, `unit: "bp" \| "bps" \| "" = "bp"` | `12.5` → `12.5 bp` |
| `formatDv01` | `currency: string = "USD"`, `compact: boolean = false` | `1234` → `$1,234`; compact → `$1.23K` |
| `formatNotional` | `decimals: number = 2`, `compact: boolean = false`, optional `unit: "mm"` | `1250000` → `1,250,000.00`; compact → `1.25M` |
| `formatSigned` | `decimals: number = 2` | `0.12` → `+0.12`; `0` → `0.00` |
| `formatPercent` | `decimals: number = 2`, `signed: boolean = false` | `1.234` → `1.23%`; signed → `+1.23%` |
| `formatQuantity` | No options beyond `locale` | `1000000.6` → `1,000,001` |

Yield and percent inputs are already percentage points: `1` means `1%`. DV01 rounds to whole currency units. Compact notional output uses `K`, `M`, `B`, or `T`; values below `1,000` round to a whole number. Signed formatters omit the sign when the displayed value rounds to zero.

`numberFormat(locale, options)` returns a cached `Intl.NumberFormat` for a locale string (or `undefined` for `"en-US"`) and `Intl.NumberFormatOptions`. Numeric formatters share this cache by locale and option set.
