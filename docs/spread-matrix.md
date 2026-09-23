# SpreadMatrix

Compare instruments in a matrix of row-minus-column spreads, or list curves and butterflies as weighted legs. Spreads print with their signs in ticks of price or basis points of yield and flash when they change.

## Usage

```tsx
import { SpreadMatrix, type SpreadInstrument, type SpreadStructure } from "@/components/ui/spread-matrix"
import type { InstrumentConvention } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"
```

```tsx
const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const curve: SpreadInstrument[] = [
  { id: "2Y", label: "2Y", convention: T32 },
  { id: "5Y", label: "5Y", convention: T32 },
  { id: "10Y", label: "10Y", convention: T32 },
]
const structures: SpreadStructure[] = [
  { id: "2s10s", label: "2s10s", legs: ["2Y", "10Y"] },
  { id: "2s5s10s", label: "2s5s10s", legs: ["2Y", "5Y", "10Y"] },
]
const quotes = createRowStore<{ id: string; price: number; yield: number }>({ getRowId: (q) => q.id })
quotes.applyDeltas({ upsert: [
  { id: "2Y", price: 100.25, yield: 4.25 },
  { id: "5Y", price: 99.75, yield: 4.125 },
  { id: "10Y", price: 99.5, yield: 4.375 },
] })

// Once per frame, patch existing quotes from your feed.
quotes.applyDeltas({ patch: [{ id: "10Y", fields: { price: 99.515625, yield: 4.375 } }] })

function CurveSpreads() {
  return <>
    <SpreadMatrix store={quotes} instruments={curve} label="Curve spreads" />
    <SpreadMatrix store={quotes} instruments={curve} structures={structures} basis="bps" label="Curve structures" />
  </>
}
```

The first table is the full matrix in ticks; the second lists the two structures in basis points. Both read the same [row store](row-store.md). Seed quotes with `upsert` before patching them: patches for unknown ids are ignored.

## API Reference

Matrix rows subscribe to their own quote through `useRow`, and cells subscribe to the column's quote. With stable props, a store update affects only the corresponding row and column; a structure row subscribes to its legs. The table uses native row and column headers and composes no shadcn component.

### Props

`SpreadMatrixProps<T extends object = SpreadQuote>` accepts the following inputs. `SpreadBasis` is `"ticks" | "bps"`; `Nullable` is `number | null | undefined` from [format](format.md).

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Quotes keyed by instrument id. |
| `instruments` | `readonly SpreadInstrument[]` | Required | The rows, and the columns unless `columns` is given, in this order. |
| `columns` | `readonly SpreadInstrument[]` | `instruments` in matrix mode | A different set across the top. Also supplies leg metadata in structures mode. |
| `basis` | `SpreadBasis` | `"ticks"` | Ticks of price or basis points of yield. |
| `structures` | `readonly SpreadStructure[]` | None | Replaces the matrix with these structure rows. An empty array shows an empty structures table. |
| `value` | `(quote: T, basis: SpreadBasis) => Nullable` | `price` for ticks, `yield` for basis points | Read a quote's value in the basis. Keep it stable between renders. |
| `format` | `(value: number, basis: SpreadBasis) => string` | `formatSpread` | Print a spread. Keep it stable between renders. |
| `label` | `string` | Required | Accessible name of the table. |
| `labels` | `Partial<SpreadMatrixLabels>` | `DEFAULT_SPREAD_MATRIX_LABELS` | Override the words listed below. |
| `flashWindowMs` | `number` | `900` | Cell flash duration in ms. |
| `className` | `string` | None | Classes on the outer scrolling `div`. |

### Instruments and quotes

| `SpreadInstrument` field | Type | Required | Purpose |
|---|---|---|---|
| `id` | `RowId` (`string`) | Yes | The quote's row id in the store. |
| `label` | `string` | Yes | The header text. |
| `convention` | `InstrumentConvention` | Yes | Supplies `tick` when this instrument is the matrix row or a structure's first leg. Other convention fields do not format the spread. |

The default reader accepts `SpreadQuote`:

| Field | Type | Default | Read for |
|---|---|---|---|
| `price` | `number \| null` | Omitted | `"ticks"`, in price points. |
| `yield` | `number \| null` | Omitted | `"bps"`, in percent: `4.25` means 4.25%. |

For another quote shape, supply `value(quote, basis)` in the same units. A missing quote, `null`, `undefined`, `NaN`, or infinity produces the null token (`–`) in affected value cells; matching row and column ids stay blank. The default reader also treats nonnumeric fields as missing. Cells fill in when valid quotes arrive.

### The cell

Each cell subtracts the column value from the row value. In the example, `+15` in the 5Y row under 10Y means the 5Y price is fifteen ticks above the 10Y price. Both use a 1/64 tick, so the reverse cell reads `−15`.

| Basis | Calculation | Default display |
|---|---|---|
| `"ticks"` | `(row − column) / row.convention.tick`, rounded to the nearest eighth by `ticksBetween`. | Signed, up to three decimals without trailing zeros: `+1.5`, `−0.5`, `0`. |
| `"bps"` | `(row yield − column yield) × 100`, rounded to 0.001 bp. Tick is ignored. | Signed, one decimal: `+12.3`, `−0.8`, `0.0`. |

Reversing a pair does not guarantee equal displayed magnitudes. A price difference of 1/64 is `+1` in a row with a 1/64 tick and `−2` in the reverse row with a 1/128 tick. Rounding ties can differ even with a shared tick: with tick `1`, a difference of `1/16` rounds to `+0.125`, while its reverse displays `0`.

Cells with the same row and column id are blank, including in a rectangular matrix. The unit appears in the corner header; default cell formatting omits it. A custom `format` receives the calculated spread, before display rounding, and is skipped for blank cells and `null` results.

Import the arithmetic and formatting helpers from `@/components/ui/spread-matrix`:

| Function | Inputs | Returns |
|---|---|---|
| `spreadBetween(a, b, basis, tick)` | `a`, `b`: `Nullable`; `basis`: `SpreadBasis`; `tick`: `number`. | `number \| null`: `a − b` converted to the basis. Missing or nonfinite sides return `null`. In ticks, a tick that is not positive also returns `null`; in bps, tick is ignored. |
| `formatSpread(value, basis)` | `value`: `Nullable`; `basis`: `SpreadBasis`. | `string`: the default display above, or `–` for missing or nonfinite values. |

### Structures

| `SpreadStructure` field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | The row's key. |
| `label` | `string` | Required | The row header. |
| `legs` | `readonly [RowId, RowId] \| readonly [RowId, RowId, RowId]` | Required | Two legs make a curve, three a butterfly. |
| `weights` | `readonly number[]` | `[-1, 1]` for two legs; `[-1, 2, -1]` for three | One weight per leg. |
| `tick` | `number` | First leg's instrument tick | Divides the weighted price sum in ticks mode. Ignored in bps mode. |

A structure sums each leg's value times its weight, then converts the sum with the same basis rounding as a matrix cell. The default curve is second leg minus first, the opposite order from a matrix's row-minus-column rule. The default butterfly is twice the middle leg minus both outer legs. Yields of `4.25`, `4.125`, and `4.375` produce `+12.5` bp for 2s10s and `−37.5` bp for 2s5s10s.

Leg quotes come from the store. Labels and the fallback tick come from `instruments` and `columns`; entries in `columns` win when ids overlap. An unknown instrument label falls back to its id. In ticks mode, provide `tick` if the first leg has no instrument metadata, or the result is missing. The Legs column joins labels with ` / `, the row carries space-separated `data-weights`, and the Spread header carries the unit.

| Function | Inputs | Returns |
|---|---|---|
| `structureSpread(values, weights, basis, tick)` | `values`: `readonly Nullable[]`; `weights`: `readonly number[] \| undefined`; `basis`: `SpreadBasis`; `tick`: `number`. | `number \| null`: weighted sum converted to the basis. Pass `undefined` for default weights. Empty values, a weight-count mismatch, or missing or nonfinite values return `null`. |
| `defaultWeights(count)` | `count`: `number`. | `readonly number[]`: `[-1, 1]` for 2, `[-1, 2, -1]` for 3, otherwise `[]`. |

The standalone helper accepts any nonempty number of values when supplied matching weights; the component accepts only two or three legs. Supply finite weights and a positive finite tick for ticks mode. Helpers do not validate weight finiteness or guard every arithmetic overflow, so `NaN` or infinity can still reach a custom formatter; `formatSpread` prints `–` for those results.

### Marks and flashes

| Attribute | Where | Meaning |
|---|---|---|
| `data-basis` and `data-mode` | The root | `ticks` or `bps`; `matrix` or `structures`. |
| `data-row` and `data-column` | Matrix cells | The two instruments' ids. |
| `data-diagonal` | Matrix cells | The row and the column are one instrument; the cell is blank. |
| `data-structure` and `data-weights` | Structure rows | The structure's id and its weights. |
| `data-spread` | A structure's value cell | The cell that flashes. |
| `data-direction` | A flashing value cell | `up` when the calculated spread rose, `down` when it fell, or `flat` for a change to or from a missing result or between signed zeros. Removed when the flash ends. |

Initial values do not flash. A changed calculated spread starts a fill flash in the direction's soft token; another change restarts it for `flashWindowMs`. Results unchanged by `Object.is` stay quiet, even if a quote updates. A change smaller than the formatter's precision can flash while the printed text stays the same, including a change between `0` and `−0`.

Flashes last only for the current mount. Reduced motion uses a static tint for the same duration instead of animation. The default formatter keeps the spread's sign visible after the flash ends; that sign describes the spread, while the flash describes its latest movement.

### Labels

`labels` merges partial overrides into `DEFAULT_SPREAD_MATRIX_LABELS`:

| Label | Default | Where |
|---|---|---|
| `instrument` | `Instrument` | The corner header of the matrix, followed by the unit |
| `structure` / `legs` / `spread` | `Structure` / `Legs` / `Spread` | The structures' headers |
| `ticks` / `bps` | `ticks` / `bp` | The unit in the header |
| `rule` | `Each cell is the row less the column.` | Matrix screen-reader caption, followed by the unit. Structures use the `spread` label and unit instead. |

### What it does not do

It does not fetch quotes, pick the mid, stage a spread, or send anything. Feed the store from your quotes and choose the basis. There is no click callback or custom-header prop; keep actions in surrounding controls or a ticket.

### Tokens

The install adds `up`, `down`, and `flat` with their soft variants if you do not have them. The flashes use the soft ones.
