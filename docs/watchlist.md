# Watchlist

A watchlist backed by a row store, with price columns, an optional add field, and three ways to request removal.

## Usage

```tsx
import { Watchlist, watchlistColumns, type WatchlistRow } from "@/components/ui/watchlist"
import { createRowStore } from "@/lib/row-store"
```

```tsx
const store = createRowStore<WatchlistRow>({ getRowId: (r) => r.symbol })

function MyWatchlist() {
  return (
    <Watchlist
      store={store}
      price={(value, row) => conventions[row.symbol].price(value)}
      onAdd={(symbol) => api.watch(symbol)}
      onRemove={(symbols) => api.unwatch(symbols)}
      validate={(symbol) => known.has(symbol)}
      onRowActivate={(row) => link.setSymbol(row.symbol)}
    />
  )
}
```

## API Reference

`Watchlist<T>` uses the `watchlist` grid preset: 22 px rows, single selection, fill flashes, and no reorder hold, arrival highlight, viewport pinning, or row-count announcements. The preset is fixed; individual grid options such as `rowHeight` and `selectionMode` can override its defaults. Give the watchlist a container with a height.

`T` extends `WatchlistRow` and defaults to it. `RowId` is a string. These are the watchlist's own inputs and the grid inputs it wraps:

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Rows keyed by `symbol`. |
| `columns` | `ColumnDef<T>[]` | `watchlistColumns({ price })` | Replace the built-in columns; removal still appends its own column when enabled. |
| `price` | `(value: number, row: T) => string` | Two decimals | Format built-in last, bid, and ask cells. Unused when `columns` is supplied. |
| `label` | `string` | `"Watchlist"` | Accessible name of the grid. |
| `onAdd` | `(symbol: string) => void` | None | Receive add requests; enables the add field. |
| `onRemove` | `(symbols: RowId[]) => void` | None | Receive removal requests; enables all three removal controls. |
| `normalize` | `(raw: string) => string` | Trim and uppercase | Normalize add-field input before lookup and validation. |
| `validate` | `(symbol: string) => boolean` | None | Synchronously accept or reject a new symbol. |
| `addPlaceholder` | `string` | `"Add symbol"` | Placeholder and accessible name of the add field. |
| `selection` | `ReadonlySet<RowId>` | Internally owned empty set | Control selected rows. |
| `onSelectionChange` | `(selection: ReadonlySet<RowId>) => void` | None | Receive grid selection changes and duplicate-add selection requests. |
| `focusedRowId` | `RowId \| null` | Internally owned `null` | Control the grid's focused row. |
| `onFocusedRowChange` | `(id: RowId \| null) => void` | None | Receive grid focus changes and duplicate-add focus requests. |
| `getRowProps` | `(row: T, id: RowId) => RowDecoration \| undefined` | None | Add row decoration; Watchlist merges `group/row` into its class. |
| `renderContextMenu` | `(rows: T[], ids: RowId[]) => ReactNode` | None | Custom menu items, followed by a separator and Remove when removal is enabled. |
| `className` | `string` | None | Classes on the outer `data-slot="tradecn-watchlist"` wrapper. |

Other [`data-grid`](data-grid.md) inputs pass through, including sorting, column state, filtering, editing, and row activation. Selection and row focus are managed by Watchlist when omitted; when controlled, apply the corresponding callback's value. The callbacks also work with internal state. Watchlist uses the same shared files as `data-grid`.

### The list is yours

`Watchlist` does not keep the list, fetch it, or decide what belongs on it. `onAdd(symbol)` and `onRemove(symbols)` say what was asked for; the rows are whatever is in the store you pass. A symbol shows up when your feed upserts it and leaves when you remove it. Leave `onAdd` out and there is no field. Leave `onRemove` out and there is no remove of any kind.

Rows are keyed by `symbol`, so create the store with `getRowId: (r) => r.symbol`.

| `WatchlistRow` field | Type | Required | Meaning |
|---|---|---|---|
| `symbol` | `string` | Yes | Store row id and displayed symbol. |
| `name` | `string` | No | Available to custom columns; not displayed by default. |
| `last`, `bid`, `ask` | `number \| null` | No | Prices passed to the price formatter. |
| `change` | `number \| null` | No | Price change against the previous close. |
| `changePct` | `number \| null` | No | Percentage value: `1.25` displays as `+1.25%`. |
| `volume` | `number \| null` | No | Volume, displayed with compact suffixes such as `1.25M`. |

### Columns

`watchlistColumns<T>(options?: WatchlistColumnOptions<T>): ColumnDef<T>[]` accepts an optional `price` callback with the signature above. It returns symbol (frozen left), last, bid, ask, change, change %, and volume. Spread the result into your own list to add a column, drop one, or reorder; frozen columns stay first.

```tsx
import { type ColumnDef } from "@/components/ui/data-grid"
import { Sparkline } from "@/components/ui/sparkline"

type TrendRow = WatchlistRow & { closes: number[] }

const columns: ColumnDef<TrendRow>[] = [
  ...watchlistColumns<TrendRow>({ price }),
  { key: "trend", header: "Trend", width: 104, flash: false, accessor: (r) => r.closes, cell: ({ row }) => <Sparkline values={row.closes} label={row.symbol} width={96} height={18} /> },
]
```

`price` gets the row because instruments differ: one prints in 32nds and the next in decimals. Missing numeric values display `NULL_TOKEN` (`–`). Change and change % use their own signed, two-decimal formatters (`+0.25`, `−12.50`, `−0.25%`) and sign-based colors, with zero flat. The price callback does not format these changes. Last, bid, and ask flash on change; change, change %, and volume do not.

Keep `columns` and `price` stable with a module constant, `useMemo`, or `useCallback`. Changing either rebuilds the column list and can re-render rows.

### Adding

Type a symbol and press Enter, or click Add. Whitespace-only input is ignored before `normalize` runs. The default normalizer trims and uppercases; supply your own where case matters. If normalization returns an empty string, the field clears without an add request.

An existing symbol is looked up in the whole store before validation. Watchlist requests selection and row focus for that symbol, clears the field, and skips `validate` and `onAdd`. Controlled selection and focus need their callbacks applied. This changes grid state; it does not move keyboard focus into the grid or scroll the row into view.

For a new symbol, `validate` returning false preserves the typed text and marks the field `aria-invalid` until the text changes. Validation is synchronous. On acceptance, Watchlist calls `onAdd` and clears the field when the callback returns; it does not await a returned promise or handle its rejection. Handle asynchronous lookup and errors in the application.

Submitting with Enter leaves focus in the input for the next symbol. Clicking Add does not explicitly restore input focus.

### Removing

Delete or Backspace on the grid requests removal of the selection, or the focused row when nothing is selected. It does nothing when neither exists or the event was already prevented. Each row has a `×` that shows on hover and requests removal of only that row. All three controls call `onRemove` with symbols; none changes the store.

The menu also uses the current selection, falling back to the focused row. Right-click requests focus for the targeted row and, when selection is enabled, replaces the selection if that row was not already selected. Apply these requests when controlling selection or focus; until then, the menu uses the existing values.

The `×` is out of the tab order on purpose. The grid is one tab stop with its own arrow keys, and the keyboard's way to remove is Delete. In the add field, Delete and Backspace edit text and remove nothing.

With custom editable columns and `onRemove`, Delete and Backspace in a cell editor can also request row removal.

### What it costs

The add field keeps its own state, so typing re-renders the field without re-rendering grid rows. `onRemove`, `renderContextMenu`, `getRowProps`, `onSelectionChange`, and `onFocusedRowChange` are read through a ref; `onAdd` stays outside the grid. These callbacks can be inline without changing the callbacks passed to memoized rows.

With stable grid inputs, a value update that leaves view membership and order unchanged re-renders only the affected visible row. The watchlist tests count cell renders during typing, parent renders, and a single-row update.

### What it does not do

Persist the list, fetch quotes, group or nest symbols, or draw a chart. It has no notion of several lists; render several `Watchlist`s over several stores.
