# SpreadMatrix

Composable tables of signed spreads in ticks or basis points.

## Usage

```tsx
import { useState } from "react"
import type { InstrumentConvention } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"
import {
  SpreadMatrix,
  SpreadMatrixTable,
  SpreadMatrixHead,
  SpreadMatrixRow,
  SpreadMatrixCell,
  type SpreadInstrument,
} from "@/components/ui/spread-matrix"

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const instruments: SpreadInstrument[] = [
  { id: "2Y", label: "2Y", convention: { ...T32, tick: 1 / 128 } },
  { id: "5Y", label: "5Y", convention: T32 },
  { id: "10Y", label: "10Y", convention: T32 },
]

function PriceSpreads() {
  const [store] = useState(() => {
    const store = createRowStore<{ id: string; price: number }>({ getRowId: (quote) => quote.id })
    store.applyDeltas({ upsert: [
      { id: "2Y", price: 100.25 },
      { id: "5Y", price: 99.75 },
      { id: "10Y", price: 99.515625 },
    ] })
    return store
  })
  return (
    <SpreadMatrix store={store} instruments={instruments} className="w-fit max-w-full">
      <SpreadMatrixTable label="Price spreads">
        <caption className="sr-only">Each cell is the row less the column. ticks.</caption>
        <thead>
          <tr>
            <SpreadMatrixHead className="text-left">Instrument (ticks)</SpreadMatrixHead>
            {instruments.map((column) => <SpreadMatrixHead key={column.id} data-column={column.id}>{column.label}</SpreadMatrixHead>)}
          </tr>
        </thead>
        <tbody>
          {instruments.map((instrument) => (
            <SpreadMatrixRow key={instrument.id} instrument={instrument}>
              <SpreadMatrixHead scope="row">{instrument.label}</SpreadMatrixHead>
              {instruments.map((column) => <SpreadMatrixCell key={column.id} column={column.id} />)}
            </SpreadMatrixRow>
          ))}
        </tbody>
      </SpreadMatrixTable>
    </SpreadMatrix>
  )
}
```

Each cell subtracts the column from the row and counts the difference in the row's tick. The 5Y row under 10Y reads `+15`. The reverse reads `−15`.

The 2Y has a smaller tick, so its spread over 5Y is `+64`, while 5Y over 2Y is `−32`. Matching ids stay blank.

Seed the [row store](row-store.md) with `upsert` before patching. Patches for unknown ids are ignored.

## Composition

Use the following composition to build a `SpreadMatrix`:

```text
SpreadMatrix
└── SpreadMatrixTable
    ├── caption
    ├── thead
    │   └── tr
    │       └── SpreadMatrixHead
    └── tbody
        └── SpreadMatrixRow
            ├── SpreadMatrixHead (scope="row")
            └── SpreadMatrixCell
                └── SpreadMatrixValue (default)
```

Use `SpreadMatrixStructureRow` for curves and butterflies:

```text
SpreadMatrix
└── SpreadMatrixTable
    ├── caption
    ├── thead
    │   └── tr
    │       └── SpreadMatrixHead
    └── tbody
        └── SpreadMatrixStructureRow
            ├── SpreadMatrixHead (scope="row")
            ├── SpreadMatrixLegs
            └── SpreadMatrixStructureCell
                └── SpreadMatrixValue (default)
```

## Yield basis

Set `basis="bps"` to compare yields in percent: `4.25` means 4.25%, and a difference of `0.125` is 12.5 bp.

<!-- demo: spread-matrix-yields -->

## Curves and butterflies

Use `SpreadMatrixStructureRow` for weighted legs and `SpreadMatrixStructureCell` for their spread.

<!-- demo: spread-matrix-structures -->

## Quote updates

Save the [yield example](#yield-basis) as `spread-matrix-yields.tsx` to reuse its `SpreadMatrixContent` here. The controls lower 5Y by one tick and restore the original quotes.

<!-- demo: spread-matrix-updates -->

## Custom layout

Reorder the collection, move leg descriptions into row headers, and add application controls with `SpreadMatrixValue` and the shared state hooks.

<!-- demo: spread-matrix-composition -->

## API Reference

Rows subscribe to their instrument and cells subscribe to the column quote. Structure rows subscribe to their legs.

With stable inputs, a quote update reaches only its row, column and dependent structures.

Supply stable instrument objects, metadata arrays, readers and formatters to avoid extra work on parent renders.

Readings and state hooks add no subscriptions.

### Props

`SpreadMatrixProps<T extends object = SpreadQuote>` extends native `div` props with required children. It coordinates data without rendering a table.

`SpreadBasis` is `"ticks" | "bps"`. `Nullable` is `number | null | undefined` from [format](format.md).

| Prop | Type | Default | Description |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Quotes keyed by instrument id. |
| `instruments` | `readonly SpreadInstrument[]` | Required | Metadata for structure leg names and fallback ticks. Last duplicate id wins. Does not choose visible rows or columns. |
| `children` | `ReactNode` | Required | Tables and surrounding application content. Conditional content is supported. |
| `basis` | `SpreadBasis` | `"ticks"` | Price ticks or yield basis points. |
| `value` | `(quote: T, basis: SpreadBasis) => Nullable` | Reads `price` or `yield` | Read the value in the selected basis. |
| `format` | `(value: number, basis: SpreadBasis) => ReactNode` | `formatSpread` | Format a calculated spread. |
| `flashWindowMs` | `number` | `900` | Cell flash duration in ms. |
| `className` | `string` | - | Additional classes to apply to the root. |

### Parts

Parts accept the native props, refs, classes and events of their elements. `SpreadMatrixTable` and `SpreadMatrixHead` work without a store. The coordinating parts require their parent contexts and throw when misplaced.

| Part | Element | Inputs |
|---|---|---|
| `SpreadMatrixTable` | `table` | Required `label: string` and `children: ReactNode`. |
| `SpreadMatrixHead` | `th` | Native children and `scope`, default `"col"`. Use `"row"` for row headers. |
| `SpreadMatrixRow` | `tr` | Required `instrument: SpreadInstrument` and `children: ReactNode`. |
| `SpreadMatrixCell` | `td` | Required `column: RowId`. Optional children replace the default reading. |
| `SpreadMatrixStructureRow` | `tr` | Required `structure: SpreadStructure` and `children: ReactNode`. |
| `SpreadMatrixStructureCell` | `td` | Optional children replace the default reading. |
| `SpreadMatrixLegs` | `td` | Optional children replace the joined leg labels. |
| `SpreadMatrixValue` | `span` | Signed reading within either spread cell. No children prop. |

Omitting cell children renders `SpreadMatrixValue`. Passing `null` leaves the cell empty.

Custom content can wrap or move the reading while the cell retains its flash. Mount one value cell per presented spread. Extra `SpreadMatrixValue` readings share that cell's subscriptions and flash.

### Hooks

| Hook | Parent | Returned state |
|---|---|---|
| `useSpreadMatrixRow()` | `SpreadMatrixRow` | `instrument: SpreadInstrument`, `value: number \| null` in the reader's input units. |
| `useSpreadMatrixCell()` | Either spread cell | `spread: number \| null`, `basis: SpreadBasis`, `diagonal: boolean`. |
| `useSpreadMatrixStructure()` | `SpreadMatrixStructureRow` | `structure: SpreadStructure`, `legLabels: readonly string[]`, `weights: readonly number[]`, `spread: number \| null`, `basis: SpreadBasis`. |

The hooks reuse their parent's state. Use them to place leg descriptions outside the default Legs column or build controls around a spread without another quote subscription. With weights or a tick outside the rule in [Structures](#structures), `spread` can also be infinite, or `NaN` in bps mode.

### Accessibility

`SpreadMatrixTable` renders a native table named by `label`. Native `aria-label` and `aria-labelledby` props are reserved. Keep `thead`, `tbody` and `tr` in their valid table positions. Supply column headers and `scope="row"` headers matching the visible collection. Place row headers before the cells they label.

Include a caption describing the calculation and unit, visually hidden with `sr-only` if the headings already explain them.

The parts add no keyboard shortcuts or live announcements. Application controls retain native focus and keyboard behavior. Name custom controls, retain signs or another non-color cue, and choose any empty state or status announcement at the call site.

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

For another quote shape, supply `value(quote, basis)` in the same units. A missing quote, `null`, `undefined`, `NaN`, or infinity produces the null token (`–`) in affected value cells. Matching row and column ids stay blank.

The default reader also treats nonnumeric fields as missing. Cells fill in when valid quotes arrive.

### The cell

Each cell subtracts the column value from the row value. In the example, `+15` in the 5Y row under 10Y means the 5Y price is fifteen ticks above the 10Y price. Both use a 1/64 tick, so the reverse cell reads `−15`.

| Basis | Calculation | Default display |
|---|---|---|
| `"ticks"` | `(row − column) / row.convention.tick`, rounded to the nearest eighth by `ticksBetween`. | Signed, up to three decimals without trailing zeros: `+1.5`, `−0.5`, `0`. |
| `"bps"` | `(row yield − column yield) × 100`, rounded to 0.001 bp. Tick is ignored. | Signed, one decimal: `+12.3`, `−0.8`, `0.0`. |

Reversing a pair does not guarantee equal displayed magnitudes. A price difference of 1/64 is `+1` in a row with a 1/64 tick and `−2` in the reverse row with a 1/128 tick.

Rounding ties can differ even with a shared tick: with tick `1`, a difference of `1/16` rounds to `+0.125`, while its reverse displays `0`.

Cells with the same row and column id are blank, including in a rectangular matrix. Put the unit in the header or caption. Default cell formatting omits it.

The default reading calls `format` with the calculated spread, before display rounding, and skips it for diagonal cells and `null` results. Custom cell children can use `SpreadMatrixValue` to retain this behavior.

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

A structure sums each leg's value times its weight, then converts the sum with the same basis rounding as a matrix cell.

The default curve is second leg minus first, the opposite order from a matrix's row-minus-column rule.

The default butterfly is twice the middle leg minus both outer legs. Yields of `4.25`, `4.125`, and `4.375` produce `+12.5` bp for 2s10s and `−37.5` bp for 2s5s10s.

Leg quotes come from the store. Labels and the fallback tick come from the root's `instruments`. The last entry wins when ids overlap.

An unknown instrument label falls back to its id.

In ticks mode, provide `tick` if the first leg has no instrument metadata. Otherwise the result is missing.

`SpreadMatrixLegs` joins labels with ` / `, and the row carries space-separated `data-weights`. Put the unit in your Spread header.

| Function | Inputs | Returns |
|---|---|---|
| `structureSpread(values, weights, basis, tick)` | `values`: `readonly Nullable[]`; `weights`: `readonly number[] \| undefined`; `basis`: `SpreadBasis`; `tick`: `number`. | `number \| null`: weighted sum converted to the basis. Pass `undefined` for default weights. Empty values, a weight-count mismatch, or missing or nonfinite values return `null`. |
| `defaultWeights(count)` | `count`: `number`. | `readonly number[]`: `[-1, 1]` for 2, `[-1, 2, -1]` for 3, otherwise `[]`. |

The standalone helper accepts any nonempty number of values when supplied matching weights. The component accepts only two or three legs.

Supply finite weights and a positive finite tick for ticks mode.

Helpers do not validate weight finiteness or guard every arithmetic overflow, so infinity can reach a custom formatter in either mode, and `NaN` in bps mode; ticks mode turns `NaN` and non-finite sums into `null` first. `formatSpread` prints `–` for those results.

### Marks and flashes

| Attribute | Where | Meaning |
|---|---|---|
| `data-basis` | The root | `ticks` or `bps`. |
| `data-row` | Matrix rows | The row instrument's id. |
| `data-row` and `data-column` | Matrix cells | The two instruments' ids. |
| `data-diagonal` | Matrix cells | The row and the column are one instrument; the cell is blank. |
| `data-structure` and `data-weights` | Structure rows | The structure's id and its weights. |
| `data-spread` | A structure's value cell | The cell that flashes. |
| `data-legs` | The optional legs cell | Joined leg labels or custom content. |
| `data-direction` | A flashing value cell | `up` when the calculated spread rose, `down` when it fell, or `flat` for a change to or from a missing result or between signed zeros. Removed when the flash ends. |

Initial values do not flash. A changed calculated spread starts a fill flash in the direction's soft token. Another change restarts it for `flashWindowMs`.

Results unchanged by `Object.is` stay quiet, even if a quote updates.

A change smaller than the formatter's precision can flash while the printed text stays the same, including a change between `0` and `−0`.

Flashes last only for the current instrument pair or structure id. Changing that identity clears the flash without replacing the cell or its focused content. Reduced motion uses a static tint for the same duration instead of animation.

The default formatter keeps the spread's sign visible after the flash ends. That sign describes the spread, while the flash describes its latest movement.

### Labels

Write headings, captions and unit labels in your composition. Use `ticks` for price ticks and `bp` for basis points.

The Usage example writes its matrix caption as `Each cell is the row less the column. ticks.`, and the Curves and butterflies example writes `Spread: bp.`; `SpreadMatrixTable` renders no caption of its own. Write yours to say which value is subtracted from which and in what unit, and translate those children and the table's `label` together.

### What it does not do

It does not fetch quotes, pick the mid, stage a spread, or send anything. Feed the store from your quotes and choose the basis.

Place actions in your own cells or surrounding controls. Native cell events are forwarded without staging an order.

### Tokens

The install adds `up`, `down`, and `flat` with their soft variants if you do not have them, plus the shared font tokens and the hyperlegible remap. The flashes use the soft ones.
