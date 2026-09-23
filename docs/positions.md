# Positions

A positions grid with signed quantities, average and mark prices, day and total P&L, a risk column you name, and totals for the displayed book.

## Usage

```tsx
import { useState } from "react"
import { createRowStore } from "@/lib/row-store"
import { Positions, type PositionRow } from "@/components/ui/positions"

const rows: PositionRow[] = [
  { id: "T2", book: "Cash", instrument: "T 2Y", position: 50_000_000, average: 100.25, mark: 100.28125, dayPnl: 15_625, totalPnl: 62_000, risk: 21_500 },
  { id: "T10", book: "Cash", instrument: "T 10Y", position: -25_000_000, average: 99.5, mark: 99.515625, dayPnl: -3_906, totalPnl: -12_000, risk: -21_000 },
  { id: "T30", book: "Cash", instrument: "T 30Y", position: 0, average: null, mark: 98.75, dayPnl: 0, totalPnl: null, risk: null },
]

function CashPositions() {
  const [store] = useState(() => {
    const store = createRowStore<PositionRow>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: rows })
    return store
  })
  return <div className="h-48 w-fit max-w-full"><Positions store={store} label="Cash positions" riskHeader="DV01" /></div>
}
```

The three rows show long, short and flat positions in one book. Without `quantityUnit`, quantities print as notional amounts in millions. Missing optional values use `–`. The footer counts the positions and sums their supplied P&L and risk, omitting missing values; it does not sum quantities across instruments.

Every value is a fixed server snapshot. The grid displays these numbers and totals them; it does not calculate P&L from average prices, marks or quantities.

## Formats and units

Set `quantityUnit="contracts"` for a contract count and leave it omitted for notional amounts. This example prints TY as `+120` and the cash position as `−25mm`. A stable `price` callback chooses fractional prices for T 10Y and three decimal places for TY. The shared money formatter prints compact P&L and DV01 for both cells and totals; it retains negative signs.

<!-- demo: positions-formats -->

## Separate books

Give each book its own store and named grid to keep selection, sorting and totals separate. These two books each contain one position, so each footer belongs only to that book. `Book` seeds its store once from its initial rows; subsequent data belongs in store batches.

<!-- demo: positions-books -->

## Server updates

The Apply next server batch button first changes only the cash note's mark. P&L and risk stay unchanged. The second batch supplies new P&L and risk values; those cells and their totals update. Changed cells flash, while totals do not. The sample values are explicit server outputs, not a valuation model.

The final state stays visible until Restore book replaces the original rows. Selection, sorting and column settings stay as you left them. There is no background publisher. Scroll the grid horizontally on a narrow screen to inspect the mark, P&L and risk columns.

<!-- demo: positions-updates -->

## API Reference

`Positions` uses [`data-grid`](data-grid.md)'s `blotter` preset: 24 px rows, fill flashes, arrival highlights, and viewport pinning when rows arrive above the visible area. Selection defaults to single with no checkboxes. Shared files are byte-identical to those installed by `data-grid`, `watchlist`, and `blotter`.

### Props

`PositionsProps<T>` accepts rows extending `PositionRow`. Give the grid a container with a height.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Position rows. |
| `columns` | `ColumnDef<T>[]` | `positionsColumns(options)` | Replace or extend the book's columns. |
| `price` | `(value: number, row: T) => string` | Two decimals | Format average and mark prices by instrument. |
| `pnl` | `(value: number, row: T) => string` | Signed whole number with separators | Format both P&L columns and their default totals. |
| `risk` | `(value: number, row: T) => string` | Signed whole number with separators | Format risk cells and the default risk total. |
| `riskHeader` | `string` | `"Risk"` | Name the default risk column, such as DV01 or Delta. |
| `totals` | `false \| Record<string, (rows: T[]) => string>` | `positionsTotals(options)` | Replace the footer values by column key, or hide the footer. |
| `label` | `string` | `"Positions"` | Accessible name of the grid. |
| `selectionMode` | `"none" \| "single" \| "multi"` | `"single"` | Choose selection behavior. |
| `selectionColumn` | `boolean` | `false` | Show checkboxes when selection is `"multi"`. |
| `renderContextMenu` | `(rows: T[], ids: RowId[]) => ReactNode` | None | Menu items for the selection or targeted row. |
| `getRowProps` | `(row: T, id: RowId) => RowDecoration \| undefined` | Side decorations | Add row classes or override the side's state and accessible description. |
| `className` | `string` | None | Classes on the outer `Positions` container. |

Sorting, filtering, a supplied `view`, column state, row callbacks, and keyboard behavior follow [`DataGrid`](data-grid.md). `preset` and `footer` are excluded; use `totals` for the footer. `PositionsColumnOptions<T>` is the shared options type for `price`, `pnl`, `risk`, and `riskHeader`.

### Every number is the server's

The server supplies positions, prices, P&L, and risk. The grid displays them and adds totals; it does not calculate P&L from positions and marks. Fills, funding, and corrections belong to the server.

| `PositionRow` field | Type | Meaning |
|---|---|---|
| `id` | `string` | Position ID; the example uses it as the store's row key. |
| `instrument` | `string` | Instrument name or identifier. |
| `position` | `number` | Signed notional amount or contract count: positive is long, negative is short, zero is flat. |
| `quantityUnit` | `"notional" \| "contracts"`, optional | Defaults to notional, displayed in millions: `-25_000_000` becomes `−25mm`. Contracts display as a whole count, such as `+120`. |
| `book` | `string`, optional | Book name. |
| `average`, `mark` | `number \| null`, optional | Average price and current mark, printed through `price`. |
| `dayPnl`, `totalPnl` | `number \| null`, optional | P&L in the account's currency, printed through `pnl`. |
| `risk` | `number \| null`, optional | The desk's risk measure, such as DV01, delta, or beta-weighted exposure. |

Missing optional cell values print the null token. `formatPosition` also returns it for a non-finite position.

### The sign says which way

Default position, P&L, and risk cells use `up` for positive finite values, `down` for negative finite values, and `flat` for zero. Position text uses signed quantities such as `+120` and `−25mm`.

P&L and risk round to whole numbers by default. A small negative value such as `-0.1` prints `0`, while `0.1` prints `+0`; the color still follows the unrounded value. Supply a formatter with enough precision when those small values need to remain distinguishable without color. Zero itself prints without a sign.

The position span carries `data-side="long"`, `"short"`, or `"flat"`. The row defaults to the same `data-state`, with an `aria-description` of `long` or `short`; flat rows have no default description. Your `getRowProps` can override either row attribute.

| Helper | Behavior |
|---|---|
| `formatPosition(row)` | Format a signed notional amount in millions or a whole contract count. |
| `positionSide(position)` | Return `"long"`, `"short"`, or `"flat"` from the position's sign. |
| `withSign(value, text)` | Prefix positive values with `+` unless the text already starts with `+`, `−`, or `-`. Used for P&L and risk cells and default totals. |

Custom `pnl` and `risk` formatters must retain negative signs themselves; `withSign` only adds a missing positive sign.

### Columns

`positionsColumns({ price, pnl, risk, riskHeader })` returns definitions in this order: book, instrument, position, average, mark, day P&L, total P&L, and risk. Instrument is frozen on the left; the grid places frozen columns before the others. Spread the list to add, remove, or reorder columns.

Position, mark, both P&Ls, and risk flash on value changes. Book, instrument, and average have flashing disabled. Override a column's `flash` setting in a custom list to change that behavior.

Keep `columns` and the formatters stable with module constants or memoization. Formatters receive the current row for cells; totals use the calling convention below. Supplying `columns` replaces the default definitions, so their cell formatting and `riskHeader` are then yours to set.

### Totals

`positionsTotals(options)` produces the default footer values:

| Column key | Total |
|---|---|
| `instrument` | Row count, such as `3 positions`. |
| `dayPnl`, `totalPnl` | Sum of finite numeric values, through `pnl`. |
| `risk` | Sum of finite numeric values, through `risk`. |

Totals read all rows in the grid's current view, including those outside the viewport. They update on store batches and when the view or footer inputs change. Null, missing, and non-finite values are omitted from sums; a sum with no finite values prints the null token. Totals do not flash. There is no position total because instruments can have different units.

The default total formatters receive `(sum, rows[0])`: the second argument is the first row in the current view, even if that row has no value for the summed field. It does not describe the aggregate. Use formatters appropriate to the whole book, or supply `totals` when aggregation needs more context.

Custom `totals` replaces the default map. Each function receives the view's rows in order and returns display text for its column key; only visible columns render totals. `totals={false}` hides the footer.

### One grid per book

For several books, render one `Positions` per book with a separate store or filtered view and its own totals, as the [separate-books example](#separate-books) does. The grid has fixed-height rows for viewport pinning and does not group or nest positions.

### What it does not do

It does not fetch, price, or net positions, or derive a position from fills. Use `renderContextMenu` or `onRowActivate` to open your ticket for a hedge, close, or transfer.

### Tokens

The install adds the grid's `up`, `down`, `flat`, `stale`, and `expiring` tokens and their soft variants where missing. Positive, negative, and flat cells use the first three.
