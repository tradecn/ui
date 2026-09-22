# Positions

The data grid as a book of positions: instrument, position signed in its unit, average, mark, the day's and the total P&L colored by their sign with the sign printed, a risk column the desk names, and totals under the body.

## Usage

```tsx
import { Positions, positionsColumns, type PositionRow } from "@/components/ui/positions"
import { createRowStore } from "@/lib/row-store"
```

```tsx
const store = createRowStore<PositionRow>({ getRowId: (p) => p.id })

<Positions
  store={store}
  riskHeader="DV01"
  price={(value, row) => conventions[row.instrument].price(value)}
  pnl={(value) => formatDv01(value, { compact: true })}
  sort={{ key: "risk", dir: "desc" }}
/>
```

## API Reference

It is the data grid in its `blotter` preset (24 px rows, fill flash, new rows highlighted and the viewport pinned when they arrive above you) with single select and no checkbox column, a book's columns, and a totals row. Every `DataGrid` prop passes through except `preset`. Sorting, the reorder hold, column state, and the keyboard are [`data-grid`](data-grid.md)'s. If you already installed `data-grid`, `watchlist`, or `blotter`, the shared files are byte-identical and nothing of yours changes.

### Every number is the server's

A `PositionRow` is `{ id, book?, instrument, position, quantityUnit?, average?, mark?, dayPnl?, totalPnl?, risk? }`, and the grid prints what it is given. The position is signed, long above zero and short below, in the row's unit: millions of notional by default, a count when `quantityUnit` is `contracts`. The P&Ls are in the account's currency as the server figures them, and `risk` is whatever number the desk carries per row, a DV01, a delta, a beta-weighted exposure, printed through `risk` and headed by `riskHeader`. Nothing here multiplies a position by a mark: a P&L worked out on the screen is a P&L that is sometimes wrong about money, and the server has the fills, the funding, and the corrections.

### The sign says which way

The position prints with its sign, `+120` or `−25mm`, and zero prints flat with no sign, the rule `formatSigned` follows everywhere. The position's span carries `data-side` (`long`, `short`, `flat`), the row carries the same word as `data-state` and says it to a screen reader, and the color follows: `up` for long and a gain, `down` for short and a loss. The color is the hint and the sign is the message, so a printout in gray reads the same. A `pnl` or `risk` formatter of yours that drops the plus, a compact currency for one, gets it back in the cell and in the total: `withSign(value, text)` is that rule, and `formatPosition(row)` and `positionSide(position)` are the other two, as functions.

### Columns

`positionsColumns({ price, pnl, risk, riskHeader })` returns book, instrument (frozen), position, average, mark, day P&L, total P&L, and risk. It is a plain list: spread it into your own to add a column, drop one, or reorder. `price` gets the row, because instruments print differently, and defaults to two decimals; `pnl` and `risk` default to a signed whole number with separators. The mark and both P&Ls flash on change; the position, the average, and the book do not. Keep the formatters stable, a module constant or a `useMemo`: they decide what every row renders.

### Totals

`positionsTotals(options)` is the grid's footer for a book: the count of positions under the instrument, and the sums of the day's P&L, the total P&L, and the risk, each printed through the same formatter as its column. The sums are of the rows shown, filtered and ordered, and are recomputed once per applied batch. There is no total under the position: a book's instruments are in different units and a sum of them would mean nothing. Pass `totals` for sums of your own and `totals={false}` for none.

### One grid per book

Grouping rows under a book, or a tree of positions under a strategy, is not here and will not be: rows of one height are what make the grid's viewport arithmetic exact when a row arrives above the first visible one. A desk with several books renders several `Positions`, one store or one filtered view each, each with its own totals, which is how the demo does it.

### What it does not do

Fetch, price, or net anything; decide a side from a fill; group or nest rows. Actions on a position, a hedge, a close, a transfer, belong to your ticket through `renderContextMenu` or `onRowActivate`.

### Tokens

The install adds the grid's tokens, `up`, `down`, `flat`, `stale`, and `expiring` with their soft variants, if you do not have them; the sign colors draw from the first two.
