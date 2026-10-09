# Blotter

An order blotter backed by a row store, with server-provided status and actions on selected or focused orders.

## Usage

```tsx
import { useState } from "react"
import { createRowStore } from "@/lib/row-store"
import { Blotter, BlotterGrid, type BlotterRow } from "@/components/ui/blotter"

const TIME = Date.UTC(2026, 8, 23, 14, 30)

export default function BlotterDemo() {
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
      <Blotter store={store}>
        <BlotterGrid sort={{ key: "time", dir: "desc" }} />
      </Blotter>
    </div>
  )
}
```

Give the grid a stable row store and a container with a height. The timestamps are fixed and display in your local timezone. Your feed owns subsequent updates. Use the shared preview alignment control to keep the left edge fixed while resizing columns.

## Composition

Compose the grid and order controls beneath `Blotter`:

```text
Blotter
├── BlotterNewButton
├── BlotterSelection
├── BlotterActionScope
│   └── BlotterActionButton
└── BlotterGrid
    └── renderContextMenu
        └── BlotterActionScope with explicit ids
            └── BlotterActionMenuItem
```

The root coordinates selection and commands. Add, move or omit controls in your own markup. Each action scope shares permission readings across its children without adding an element.

## Permission-filtered actions

Use `BlotterActionButton` and `BlotterActionMenuItem` to show permitted counts and recheck permissions when invoked. Cancel simulates an immediate server response. Amend and New order record requests. **Finish first order** revokes its permissions; **Restore orders** resets the data.

Save this complete example as `blotter-actions.tsx` beside consumers that import its `OrderToolbar` and `OrderMenu` recipes, outside `components/ui`. The recipes preserve custom menu content. Unavailable toolbar buttons return focus to the toolbar; a revoked menu item keeps focus and becomes inert.

<!-- demo: blotter-actions -->

## Custom layout

Use `useBlotterActions` for a native action picker beside the grid, with New above it and the target count below. The picker focuses its select before dispatch. When the chosen definition disappears, it clears the choice and disables submission until you select again.

Save the preceding actions example as `blotter-actions.tsx` beside this file. Its `useOrderActionFocus` helper returns focus to the select if an external update disables the active submit button.

<!-- demo: blotter-layout -->

## Server reports and status

**Receive report** applies the next server report. The second fills the order while its status remains `PartiallyFilled`; the third reports `Filled`. **Reset reports** starts the sequence again.

<!-- demo: blotter-reports -->

## API Reference

### Blotter

`Blotter<T>` is a native `div` with required children. `T` extends `BlotterRow` and defaults to it. `RowId` is a string.

The root forwards native props, refs and events and renders only the children you supply.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Orders, keyed by a stable row id. |
| `children` | `ReactNode` | Required | Your grid, controls and surrounding content. |
| `onNew` | `() => void` | None | Receive new-order requests. |
| `actions` | `readonly BlotterAction<T>[]` | Empty list | Available command definitions without generated controls. |
| `selection` | `ReadonlySet<RowId>` | Internally owned empty set | Control selected rows. |
| `onSelectionChange` | `(selection: ReadonlySet<RowId>) => void` | None | Receive selection changes. |
| `focusedRowId` | `RowId \| null` | Internally owned `null` | Control row focus. |
| `onFocusedRowChange` | `(id: RowId \| null) => void` | None | Receive focus changes. |
| `className` | `string` | None | Classes on the outer `tradecn-blotter` container. |

Selection and focus callbacks work in either mode. When controlled, apply the corresponding callback's value.

The root does not subscribe to row updates.

### BlotterGrid

`BlotterGrid<T>` uses the `blotter` preset: 24 px rows, multiple selection, fill flashes, a 750 ms reorder hold, arrival highlights, viewport pinning and debounced row-count announcements. The checkbox column is enabled by default. Individual grid options can override preset defaults.

Use the same row type for `Blotter<T>` and `BlotterGrid<T>` when supplying custom columns. Context cannot infer a generic row type from the parent JSX.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `columns` | `ColumnDef<T>[]` | Built-in columns | Replace the built-in columns. |
| `price` | `(value: number, row: T) => string` | Two decimals | Format built-in price cells, unused with custom columns. |
| `time` | `(ms: number) => string` | Local `HH:MM:SS` | Format built-in timestamps, unused with custom columns. A time a `Date` can't hold, such as `NaN`, prints `–` instead of calling it. The default reads the runtime's time zone, so server-rendered times use the server's. |
| `label` | `string` | `"Blotter"` | Accessible grid name. |
| `selectionColumn` | `boolean` | `true` | Show checkboxes in multiple-selection mode. |
| `deleteAction` | `string` | None | Action id for Delete and Backspace on the focused grid. |
| `renderContextMenu` | `(rows, ids) => ReactNode` | None | Complete caller-owned menu content. |
| `className` | `string` | None | Classes on the `tradecn-blotter-grid` sizing wrapper. |
| `ref` | `Ref<HTMLDivElement>` | None | Ref to the sizing wrapper. |
| `onKeyDown` | `(event) => void` | None | Receives bubbling keys before the optional action. Prevent default to cancel it. |

Omitting `columns` builds `blotterColumns({ price, time })`. The menu renderer receives `rows: T[]` and `ids: RowId[]`. `onKeyDown` receives a React `KeyboardEvent<HTMLDivElement>` from the sizing wrapper.

Other [DataGrid](data-grid.md) inputs pass through, including sorting, column state, filtering, editing, footer totals and activation. Store, preset, selection and focus come from the root.

A row is named by its cells, so a screen reader can read the focused row again when a fill or a status changes it, which on a blotter is news. Pass `getRowLabel` for a name that holds, and the grid reads the row's cells once when focus rests on it instead; a fill or a status change on the focused row then goes unsaid until focus moves.

The wrapper fills its parent's height and can flex within the root. Give a separate block wrapper a height when moving the grid into another layout.

Blotter installs the same shared files as DataGrid and Watchlist.

### Action scope and controls

`BlotterActionScope` requires `children` and accepts optional `ids: readonly RowId[]`. Omit `ids` to use root targets: the selection, or the focused row when nothing is selected. Pass explicit ids for a context menu or an individual order.

One scope subscribes once per distinct target id, including missing rows that may return. Multiple controls share those subscriptions.

Explicit ids preserve input order and duplicates in counts and dispatched rows. Only listeners are deduplicated. Pass unique ids when each order should appear once.

| Part | Own props | Default content | Behavior |
|---|---|---|---|
| `BlotterNewButton` | Installed Button props | `New order` | Calls `onNew`, disabled when absent. |
| `BlotterSelection` | Native span props | `{n} selected`, empty at zero | Polite live reading of root targets, even inside an explicit scope. |
| `BlotterActionButton` | Required `action: string`, installed Button props | Label and permitted count | Requires a scope, disabled for unknown or unavailable actions. |
| `BlotterActionMenuItem` | Required `action: string`, installed ContextMenuItem props | Label, omitting the count for one target | Requires a scope, disabled for unknown or unavailable actions. |

All controls forward refs, classes, events and children.

Button parts default to compact styling and `type="button"`. Explicit sizes pass through to the installed Button; `size={null}` suppresses its size-variant classes. `BlotterActionButton` uses the destructive variant when its definition requests it, unless you override the variant.

The menu item keeps the installed default variant.

Prevent default in `onClick` to cancel dispatch. Custom children replace generated labels, including explicit `null`.

Use the shared recipes above for ordinary controls and menus.

Your layout owns grouping, accessible names for custom controls, and a useful focus destination when live permissions remove or disable the active control.

Available buttons retain focus after activation. Unavailable toolbar buttons return focus to the toolbar. A revoked menu item keeps focus with a visible ring, and Enter does nothing until that same action is restored or you navigate to another item. The custom picker keeps its select available.

A labelled toolbar groups the ordinary buttons, which remain reachable with Tab.

### Hooks

`useBlotter()` returns selection and commands without subscribing to rows. It requires `Blotter`.

| Member | Type | Meaning |
|---|---|---|
| `selection` | `ReadonlySet<RowId>` | Current selection. |
| `focusedRowId` | `RowId \| null` | Current focused row. |
| `targets` | `readonly RowId[]` | Selection, or the focused row when selection is empty. |
| `select` | `(selection: ReadonlySet<RowId>) => void` | Request a selection change. |
| `focus` | `(id: RowId \| null) => void` | Request a focus change. |
| `canNew` | `boolean` | Whether a new-order callback exists. |
| `newOrder` | `() => void` | Invoke the current new-order callback. |
| `run` | `(action: string, ids: readonly RowId[]) => void` | Dispatch a defined action after checking current store permissions. |

`useBlotterActions()` requires `BlotterActionScope` and returns `{ ids, actions, run }`. `ids` is the scope's ordered target list.

Each `BlotterActionState` contains `id`, `label`, optional `destructive`, and `allowedIds: readonly RowId[]`. It exposes no raw handler.

Its `run(action: string)` uses the scope's current ids and the same checked root command. Permission readings are display state, never authorization for later dispatch.

### BlotterRow

| `BlotterRow` field | Type | Required | Meaning |
|---|---|---|---|
| `id` | `string` | Yes | Order id, used as the store key in the example. |
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

Blotter never derives status from quantities. An order filled 5,000 of 5,000 still says `PartiallyFilled` until the server changes it. The server may know about a bust, correction, or fill still in flight.

A status change flashes flat because it has no numeric direction.

### Actions are the server's too

Each order's `allowedActions` lists the actions the server permits now. An absent or empty list permits none. Define available commands with `BlotterAction<T>`:

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | `string` | Yes | Match against each order's `allowedActions`. |
| `label` | `string` | Yes | Action verb, such as `"Cancel"`; controls add the count. |
| `run` | `(rows: T[], ids: RowId[]) => void` | Yes | Receive only currently permitted rows and their store ids. |
| `destructive` | `boolean` | No | Use the destructive toolbar-button style without changing the menu item. |

The ordinary button shows `Cancel 3` when all three targets allow it, `Cancel 2 of 3` when one does not, and a disabled `Cancel` when none do. `BlotterSelection` reports the number of root targets as "selected", including a focused-row fallback. Targets a filter has hidden stay in the count and in the action — working orders off screen are still cancelled — while removed orders leave the action but stay counted until your application prunes the selection.

Permissions are checked when controls render and again against the store when invoked. Only the second check's permitted rows reach `run`. If none remain, it is not called. `allowedActions` is the server's last report, not a guarantee.

Handle confirmation, submission and rejection in `run`. Blotter does not await a returned promise, show pending state or handle errors.

An action scope listens to its target rows. A row update changes permission readings and the affected grid row without a grid-wide render. Unrelated updates do not wake the scope.

Pass `renderContextMenu` to enable a menu. The shared `OrderMenu` recipe captures actions permitted for at least one target when opened. It shows a disabled "Nothing to do here" item if none are offered.

An open menu keeps its action positions stable. Permission loss disables an item, and restoration enables it again. Newly offered actions appear when the menu reopens or its targets change.

A single target shows `Cancel`. Multiple or mixed targets get counts.

Place custom content inside `OrderMenu` to keep it before a conditional separator and the permitted actions.

Set `hasCustom` when a supplied renderer can return `undefined`. Explicit `null` counts as custom content by default. Pass `hasCustom={false}` to request the fallback for empty output.

The renderer receives the grid's target rows and ids without action-permission filtering.

The menu acts on the selection, or with nothing selected on the row it opened on, which it keeps while it stays open, even after that row leaves the view. Right-clicking plain row content requests focus for that row and, when selection is enabled, replaces the selection if that row was not already selected.

Apply these requests when controlling selection or focus. Until then, a selection that doesn't hold the row stays what the menu acts on.

Action invocation rechecks the store even if the displayed count has become stale.

`allowedRows<T>(store: RowStore<T>, ids: readonly RowId[], action: string): { rows: T[]; ids: RowId[] }` exposes the same filter for your own hotkeys or menus. It reads the store immediately, skips missing or disallowed rows, and preserves input order and duplicates. It does not run an action or change the store.

### Delete cancels nothing by default

`deleteAction="cancel"` runs the matching action when Delete or Backspace is pressed on the focused grid. It uses the selection, or the focused row when the selection is empty, rechecks permissions before dispatch, and runs once per press: a held key's repeats run nothing more. When the focused order leaves the view, as a fill can take it, focus goes to the order now at its place, so with nothing selected a Delete pressed after that acts on that order; a selection, which the grid never prunes, stays what Delete acts on, the departed order included.

Deletion keys are off by default. Nothing runs when the event was prevented, no rows are in hand, no matching action exists or no target still allows it.

Cell editors, custom controls, header controls, selection checkboxes, nested grids and portaled content keep their own key behavior. `onKeyDown` still receives bubbling events before this check.

After using a control, press Shift+Tab until the grid has focus to preserve selection. Clicking a cell without a control also focuses the grid and selects that row.

Use action buttons, menu items or `useBlotterActions().run` for commands elsewhere in your layout.

### Columns

`blotterColumns<T>(options?: BlotterColumnOptions<T>): ColumnDef<T>[]` accepts optional `price` and `time` callbacks with the signatures above. It returns time, symbol, side, quantity, filled, price, status, and account. Spread the list into your own to add a column, drop one, or reorder.

`price` gets the order because instruments print differently. Quantity and filled use `formatQuantity`. Missing price, filled, or account values display `NULL_TOKEN` (`–`).

Side displays as `BUY` or `SELL`, with the `up` and `down` colors respectively. The words identify the side without relying on color.

Filled and price flash on change. Quantity and time do not.

The default view uses store order. Pass `sort={{ key: "time", dir: "desc" }}` for newest first.

Keep `columns`, `price`, and `time` stable with a module constant, `useMemo`, or `useCallback`. New columns can re-render rows. When using built-in columns, changing `price` or `time` rebuilds the list.

`actions`, `renderContextMenu`, `onSelectionChange` and `onFocusedRowChange` can be inline without repainting grid rows. Commands use the latest committed definitions, and the grid receives the current menu renderer directly.

### Adding

`onNew` reports a new-order request. Open your ticket there. The order appears when your feed upserts it.

Blotter does not await a promise returned by `onNew` or handle its errors.

### What it does not do

Build or send an order, confirm a cancel, group by parent order, or calculate order-specific totals. Use the grid's `footer` for totals you define. It has no notion of fills as rows of their own. Use a second blotter over a second store.
