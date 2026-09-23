# SpreadMatrix

Instruments down the side and across the top, each cell the spread of the row over the column in ticks or basis points, printed with its sign and flashing as it moves, or a list of curves and butterflies as weighted legs.

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

// once per frame, from your feed
quotes.applyDeltas({ patch: [{ id: "10Y", fields: { price: 99.515625, yield: 4.375 } }] })

<SpreadMatrix store={quotes} instruments={curve} label="Curve spreads" />
<SpreadMatrix store={quotes} instruments={curve} structures={structures} basis="bps" label="Curve structures" />
```

The first call is the full matrix in ticks; the second lists the two structures in basis points. Both read the same store, and a quote that moves wakes only the cells it is part of.

## API Reference

Every row subscribes to its own quote through `useRow` and every cell to its column's, so a batch that moves one instrument re-renders that instrument's row and its column and nothing else. The table is plain markup with row and column headers; it composes no shadcn component.

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Quotes keyed by instrument id. |
| `instruments` | `readonly SpreadInstrument[]` | Required | The rows, and the columns unless `columns` is given, in this order. |
| `columns` | `readonly SpreadInstrument[]` | `instruments` | A different set across the top, for one set against another. |
| `basis` | `"ticks" \| "bps"` | `"ticks"` | Ticks of price or basis points of yield. |
| `structures` | `readonly SpreadStructure[]` | None | Curves and butterflies. When given, the table lists these as rows instead of the matrix. |
| `value` | `(quote: T, basis: SpreadBasis) => Nullable` | `price` for ticks, `yield` for basis points | Read a quote's value in the basis. Keep it stable between renders. |
| `format` | `(value: number, basis: SpreadBasis) => string` | `formatSpread` | Print a spread. Keep it stable between renders. |
| `label` | `string` | Required | Accessible name of the table. |
| `labels` | `Partial<SpreadMatrixLabels>` | `DEFAULT_SPREAD_MATRIX_LABELS` | Override the words listed below. |
| `flashWindowMs` | `number` | `900` | Cell flash duration in ms. |
| `className` | `string` | None | Classes on the root. |

### Instruments and quotes

| `SpreadInstrument` field | Type | Purpose |
|---|---|---|
| `id` | `RowId` | The quote's row id in the store. |
| `label` | `string` | The header text. |
| `convention` | `InstrumentConvention` | The tick a spread in ticks is counted in when this instrument is the row. |

The default reader takes `price` from a quote for a spread in ticks and `yield`, in percent, for one in basis points. A quote shaped otherwise is read through `value`, which gets the quote and the basis. A missing quote, or a value that is not a number, prints the null token in every cell it touches and fills in when it arrives.

### The cell

Each cell is the row less the column, so the matrix is antisymmetric and every cell carries its sign: `+15` in the 5Y row under 10Y means the 5Y price is fifteen ticks above the 10Y price, and the 10Y row under 5Y says `−15`. In ticks, the difference is counted in the row instrument's tick to the nearest eighth through `ticksBetween`; a 2Y in 1/128ths and a 10Y in 1/64ths each count in their own. In basis points, yields in percent are differenced and scaled by 100, to a thousandth of a basis point. The diagonal is blank. The unit prints once, in the corner header, never in a cell.

| Function | Returns |
|---|---|
| `spreadBetween(a, b, basis, tick)` | `a − b` in the basis, or null when a side is missing or the tick is not positive. |
| `formatSpread(value, basis)` | `+1.5`, `−0.5`, `0` in ticks; `+12.3`, `−0.8` in basis points; the null token for nothing. |

### Structures

| `SpreadStructure` field | Type | Purpose |
|---|---|---|
| `id` | `string` | The row's key. |
| `label` | `string` | The row header. |
| `legs` | `[RowId, RowId] \| [RowId, RowId, RowId]` | Two legs make a curve, three a butterfly. |
| `weights` | `readonly number[]` | One per leg. Default `[-1, 1]`, the second leg less the first, and `[-1, 2, -1]`, the belly against the wings. |
| `tick` | `number` | The tick a spread in ticks is counted in. Default: the first leg's instrument. |

A structure's spread is each leg's value times its weight, summed, in the basis; `structureSpread(values, weights, basis, tick)` is that arithmetic and `defaultWeights(count)` the defaults. The Legs column names the legs by their instrument labels, the row carries `data-weights`, and a leg the store lacks prints the null token. The Spread header carries the unit.

### Marks and flashes

| Attribute | Where | Meaning |
|---|---|---|
| `data-basis` and `data-mode` | The root | `ticks` or `bps`; `matrix` or `structures`. |
| `data-row` and `data-column` | Matrix cells | The two instruments' ids. |
| `data-diagonal` | Matrix cells | The row and the column are one instrument; the cell is blank. |
| `data-structure` and `data-weights` | Structure rows | The structure's id and its weights. |
| `data-spread` | A structure's value cell | The cell that flashes. |
| `data-direction` | A flashing cell | `up` when the spread rose, `down` when it fell, for the flash window. |

A cell flashes once per move, filled in the direction's soft token. The color is never the only channel: every value is printed with its sign, and the sign stays after the flash ends.

### Labels

`labels` merges partial overrides into `DEFAULT_SPREAD_MATRIX_LABELS`:

| Label | Default | Where |
|---|---|---|
| `instrument` | `Instrument` | The corner header of the matrix, followed by the unit |
| `structure` / `legs` / `spread` | `Structure` / `Legs` / `Spread` | The structures' headers |
| `ticks` / `bps` | `ticks` / `bp` | The unit in the header |
| `rule` | `Each cell is the row less the column.` | The table's caption, read to a screen reader |

### What it does not do

It does not fetch quotes, pick the mid, stage a spread, or send anything. Feed the store from your quotes, choose the basis, and handle a click in your own row header or ticket.

### Tokens

The install adds `up`, `down`, and `flat` with their soft variants if you do not have them. The flashes use the soft ones.
