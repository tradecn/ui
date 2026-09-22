# Watchlist

The data grid as a watchlist: symbol, last, bid, ask, change, change %, and volume, with a field that adds and three ways to remove.

## Usage

```tsx
import { Watchlist, watchlistColumns, type WatchlistRow } from "@/components/ui/watchlist"
import { createRowStore } from "@/lib/row-store"
```

```tsx
const store = createRowStore<WatchlistRow>({ getRowId: (r) => r.symbol })

<Watchlist
  store={store}
  price={(value, row) => conventions[row.symbol].price(value)}
  onAdd={(symbol) => api.watch(symbol)}
  onRemove={(symbols) => api.unwatch(symbols)}
  validate={(symbol) => known.has(symbol)}
  onRowActivate={(row) => link.setSymbol(row.symbol)}
/>
```

## API Reference

It is the data grid in its `watchlist` preset (22 px rows, single select, fill flash) with a set of columns, a field that adds, and three ways to remove. Every `DataGrid` prop passes through except `preset`. Sorting, the reorder hold, column state, and the keyboard are [`data-grid`](data-grid.md)'s. If you already installed `data-grid`, the shared files are byte-identical and nothing of yours changes.

### The list is yours

`Watchlist` does not keep the list, fetch it, or decide what belongs on it. `onAdd(symbol)` and `onRemove(symbols)` say what was asked for; the rows are whatever is in the store you pass. A symbol shows up when your feed upserts it and leaves when you remove it. Leave `onAdd` out and there is no field. Leave `onRemove` out and there is no remove of any kind.

Rows are keyed by `symbol`, so create the store with `getRowId: (r) => r.symbol`.

### Columns

`watchlistColumns({ price })` returns symbol (frozen), last, bid, ask, change, change %, and volume. It is a plain list: spread it into your own to add a column, drop one, or reorder.

```tsx
const columns = [...watchlistColumns({ price }), { key: "trend", header: "Trend", width: 104, flash: false, accessor: (r) => r.closes, cell: ({ row }) => <Sparkline values={row.closes} label={row.symbol} width={96} height={18} /> }]
```

`price` gets the row because instruments differ: one prints in 32nds and the next in decimals. It defaults to two decimals. A missing bid, ask, or volume prints the one null token from `format`, never a blank and never `NaN`. Changes are signed (`+0.25`, `−12.50`) and colored by that sign, with zero flat, so the color is not the only thing saying which way. Last, bid, and ask flash on change; the change columns do not, because they would only repeat it.

Keep `columns` and `price` stable (a module constant, or `useMemo`). They decide what every row renders, so a new one on every render is a new grid on every render.

### Adding

Type a symbol and press Enter, or Add. It is trimmed and upper-cased first; pass `normalize` where case matters. The field clears and keeps focus, because people add several in a row.

A symbol that is already on the list is not added again. The grid selects and focuses that row instead, which is also the quickest way to find one. `validate` returning false leaves the symbol in the field and marks it `aria-invalid` until it changes.

### Removing

Delete or Backspace on the grid removes the selection, or the focused row when nothing is selected. Each row has a `×` that shows on hover. The right-click menu has Remove, under whatever `renderContextMenu` gives it. All three call `onRemove` with symbols; none of them touches the store.

The `×` is out of the tab order on purpose. The grid is one tab stop with its own arrow keys, and the keyboard's way to remove is Delete. In the add field, Delete and Backspace edit text and remove nothing.

### What it costs

The add field keeps its own state, so a keystroke in it re-renders the field and not one row. Your `onAdd`, `onRemove`, `renderContextMenu`, `getRowProps`, `onSelectionChange`, and `onFocusedRowChange` are read through a ref, so they can be inline without re-rendering the rows each time your component renders. A delta to one row still re-renders that row only. There is a test that counts.

### What it does not do

Persist the list, fetch quotes, group or nest symbols, or draw a chart. It has no notion of several lists; render several `Watchlist`s over several stores.
