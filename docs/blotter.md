# Blotter

An order blotter backed by a row store, with server-provided status and actions on selected or focused orders.

## Usage

```tsx
import { useState } from "react"
import { createRowStore } from "@/lib/row-store"
import { Blotter, type BlotterRow } from "@/components/ui/blotter"

const TIME = Date.UTC(2026, 8, 23, 14, 30)

function OrderBlotter() {
  const [store] = useState(() => {
    const rows = createRowStore<BlotterRow>({ getRowId: (row) => row.id, lane: "ordered" })
    rows.applyDeltas({ upsert: [
      { id: "O-1", time: TIME, symbol: "ES", side: "buy", quantity: 10, filled: 0, price: 5012.25, status: "Working", account: "A-1" },
      { id: "O-2", time: TIME + 1000, symbol: "CL", side: "sell", quantity: 5, filled: 5, price: 78.1, status: "Filled", account: "A-2" },
    ] })
    return rows
  })

  return (
    <div className="h-40 w-fit max-w-full">
      <Blotter store={store} sort={{ key: "time", dir: "desc" }} />
    </div>
  )
}
```

Give the blotter a stable row store and a container with a height. These two supplied orders use the built-in columns and decimal price format. Their timestamps are fixed; the time column displays them in your local timezone. The sort puts the newest order first.

The component prints the supplied status. Your feed owns order updates; no order changes in this basic example. Use the shared preview alignment control to keep the left edge fixed while resizing columns.

## Permission-filtered actions

Select all three orders. **Cancel 2 of 3** and **Amend 1 of 3** reflect their `allowedActions`. Choose **Finish first order** to simulate a server update while the selection stays in place; Cancel then permits only the second order. **Restore orders** restores the original rows and permissions without clearing the selection.

Cancel simulates an immediate server response and writes `Cancelled` back to the permitted rows. Amend and New order only record requests; an application opens its ticket or calls its service there. The same actions appear in the context menu, and this example explicitly enables Delete and Backspace as Cancel shortcuts. The readout identifies the rows that reached each handler. On narrow screens, scroll the specimen to reach the whole toolbar.

<!-- demo: blotter-actions -->

## Server reports and status

Choose **Receive report** to apply three supplied updates. The first is a partial fill. The second fills all four units but still says `PartiallyFilled`; the final report changes the status to `Filled`. The blotter never infers that last transition from quantity.

The Filled and Status cells flash when their values change. The last report stays visible, and **Reset reports** starts the sequence again. There is no background publisher.

<!-- demo: blotter-reports -->

## API Reference

`Blotter<T>` uses the `blotter` grid preset: 24 px rows, multiple selection, fill flashes, a 750 ms reorder hold, arrival highlights, viewport pinning, and debounced row-count announcements. It enables a checkbox column. The preset is fixed; individual grid options can override its defaults. Give the blotter a container with a height.

`T` extends `BlotterRow` and defaults to it. `RowId` is a string. These are the blotter's own inputs and the grid inputs it wraps:

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Orders, keyed by a stable row id. |
| `columns` | `ColumnDef<T>[]` | `blotterColumns({ price, time })` | Replace the built-in columns. |
| `price` | `(value: number, row: T) => string` | Two decimals | Format built-in price cells. Unused when `columns` is supplied. |
| `time` | `(ms: number) => string` | Local `HH:MM:SS` | Format built-in timestamps. Unused when `columns` is supplied. |
| `label` | `string` | `"Blotter"` | Accessible name of the grid. |
| `onNew` | `() => void` | None | Receive new-order requests; enables the new-order button. |
| `newLabel` | `string` | `"New order"` | Text on the new-order button. |
| `actions` | `readonly BlotterAction<T>[]` | Empty list | Actions in the toolbar and context menu. |
| `deleteAction` | `string` | None | Action id for Delete and Backspace on the grid. |
| `selection` | `ReadonlySet<RowId>` | Internally owned empty set | Control selected rows. |
| `onSelectionChange` | `(selection: ReadonlySet<RowId>) => void` | None | Receive selection changes. |
| `focusedRowId` | `RowId \| null` | Internally owned `null` | Control the grid's focused row. |
| `onFocusedRowChange` | `(id: RowId \| null) => void` | None | Receive row-focus changes. |
| `selectionColumn` | `boolean` | `true` | Show checkboxes when `selectionMode` is `"multi"`. |
| `renderContextMenu` | `(rows: T[], ids: RowId[]) => ReactNode` | None | Custom menu items, followed by a separator and available actions. |
| `className` | `string` | None | Classes on the outer `data-slot="tradecn-blotter"` wrapper. |

Other [`data-grid`](data-grid.md) inputs pass through, including sorting, column state, filtering, editing, footer totals, and row activation. Selection and row focus are managed by Blotter when omitted; when controlled, apply the corresponding callback's value. The callbacks also work with internal state. Blotter uses the same shared files as `data-grid` and `watchlist`.

| `BlotterRow` field | Type | Required | Meaning |
|---|---|---|---|
| `id` | `string` | Yes | Order id; used as the store key in the example. |
| `time` | `number` | Yes | Timestamp in milliseconds since the Unix epoch. |
| `symbol` | `string` | Yes | Instrument symbol. |
| `side` | `BlotterSide` (`"buy" \| "sell"`) | Yes | Order side. |
| `quantity` | `number` | Yes | Order quantity. |
| `filled` | `number \| null` | No | Filled quantity. |
| `price` | `number \| null` | No | Order price. |
| `status` | `string` | Yes | Server-provided status, displayed unchanged. |
| `account` | `string` | No | Account text. |
| `allowedActions` | `readonly string[]` | No | Action ids currently allowed for this order. |

### The status is the server's

Blotter never derives status from quantities. An order filled 5,000 of 5,000 still says `PartiallyFilled` until the server changes it; the server may know about a bust, correction, or fill still in flight. A status change flashes flat because it has no numeric direction.

### Actions are the server's too

Each order's `allowedActions` lists the actions the server permits now. An absent or empty list permits none. Define the available controls with `BlotterAction<T>`:

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | `string` | Yes | Match against each order's `allowedActions`. |
| `label` | `string` | Yes | Action verb, such as `"Cancel"`; controls add the count. |
| `run` | `(rows: T[], ids: RowId[]) => void` | Yes | Receive only currently permitted rows and their store ids. |
| `destructive` | `boolean` | No | Use the destructive toolbar-button style; does not change the menu item. |

The orders in hand are the selection, or the focused row when nothing is selected. The toolbar shows `Cancel 3` when all three allow it, `Cancel 2 of 3` when one does not, and a disabled `Cancel` when none do. The toolbar appears when `onNew` or at least one action is supplied. Its polite live region reports the number in hand as "selected", including a focused-row fallback.

Permissions are checked when controls render and again against the store when invoked. Only the second check's permitted rows reach `run`; if none remain, it is not called. `allowedActions` is the server's last report, not a guarantee. Handle confirmation, submission, and rejection in `run`: Blotter does not await a returned promise, show pending state, or handle errors.

The toolbar subscribes to the orders in hand. A row update that removes permission changes its count without a grid-wide render.

The context menu is enabled when at least one action or a custom renderer is supplied. It offers only actions permitted for at least one target row. A single permitted target shows `Cancel`; multiple or mixed targets get counts. With at least one action but none permitted and no custom menu, it shows a disabled "Nothing to do here" item. Custom items receive the grid's target rows and ids without action-permission filtering.

Right-click requests focus for the targeted row and, when selection is enabled, replaces the selection if that row was not already selected. The menu uses the resulting selection, falling back to row focus. Apply these requests when controlling selection or focus; until then, the menu uses the existing values. Action invocation rechecks the store even if the displayed count has become stale.

`allowedRows<T>(store: RowStore<T>, ids: readonly RowId[], action: string): { rows: T[]; ids: RowId[] }` exposes the same filter for your own hotkeys or menus. It reads the store immediately, skips missing or disallowed rows, and preserves input order. It does not run an action or change the store.

### Delete cancels nothing by default

`deleteAction="cancel"` makes Delete and Backspace on the grid run the matching action on the orders in hand, through the same permission check. It is off by default. Nothing runs if the event was already prevented, no rows are in hand, or the id has no matching action. From the toolbar's buttons those keys do nothing.

With custom editable columns and `deleteAction`, Delete and Backspace in a cell editor can also run the action.

### Columns

`blotterColumns<T>(options?: BlotterColumnOptions<T>): ColumnDef<T>[]` accepts optional `price` and `time` callbacks with the signatures above. It returns time, symbol, side, quantity, filled, price, status, and account. Spread the list into your own to add a column, drop one, or reorder.

`price` gets the order because instruments print differently. Quantity and filled use `formatQuantity`; missing price, filled, or account values display `NULL_TOKEN` (`–`). Side displays as `BUY` or `SELL`, with the `up` and `down` colors respectively. The words identify the side without relying on color.

Filled and price flash on change. Quantity and time do not. The default view uses store order; pass `sort={{ key: "time", dir: "desc" }}` for newest first.

Keep `columns`, `price`, and `time` stable with a module constant, `useMemo`, or `useCallback`. New columns can re-render rows; when using built-in columns, changing `price` or `time` rebuilds the list. `actions`, `renderContextMenu`, `onSelectionChange`, and `onFocusedRowChange` are read through a ref and can be inline; changing action ids or labels rebuilds the menu callback.

### Adding

`onNew` reports a new-order request. Open your ticket there; the order appears when your feed upserts it. Blotter does not await a promise returned by `onNew` or handle its errors.

### What it does not do

Build or send an order, confirm a cancel, group by parent order, or calculate order-specific totals. Use the grid's `footer` for totals you define. It has no notion of fills as rows of their own; use a second blotter over a second store.
