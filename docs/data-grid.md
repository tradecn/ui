# DataGrid

A virtualized, editable grid backed by a row store, with sorting, selection, and per-cell flashes.

## Usage

Seed a stable store, define its columns, and give the grid an accessible name and a container with a height. Sizes below are notionals; prices print in 32nds.

```tsx
import { useState } from "react"
import { createInstrumentFormatter, formatNotional } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"
import { DataGrid, type ColumnDef } from "@/components/ui/data-grid"

interface Inquiry {
  id: string
  client: string
  size: number
  price: number
}

const rows: Inquiry[] = [
  { id: "Q-1", client: "ALPHA", size: 5_000_000, price: 99.5 },
  { id: "Q-2", client: "BETA", size: 10_000_000, price: 99.515625 },
  { id: "Q-3", client: "GAMMA", size: 15_000_000, price: 99.53125 },
]
const note = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const columns: ColumnDef<Inquiry>[] = [
  { key: "client", header: "Client", width: 140, accessor: (row) => row.client },
  { key: "size", header: "Size", width: 100, numeric: true, accessor: (row) => row.size, format: (value) => formatNotional(value as number, { unit: "mm" }) },
  { key: "price", header: "Price", width: 100, numeric: true, font: "mono", accessor: (row) => row.price, format: (value) => note.price(value as number) },
]

export default function DataGridDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Inquiry>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: rows })
    return store
  })
  return <div className="h-40 w-full"><DataGrid store={store} columns={columns} preset="rfq" label="Open inquiries" /></div>
}
```

## Controlled state

Control `sort` and `columnState` when your application needs to keep or restore the view. Click a header to sort; drag its edge to resize, or open its menu to move or hide a column. Client stays frozen on the left. Reset view restores both state values.

<!-- demo: data-grid-controlled -->

## Selection and actions

Set `selectionMode="multi"` to extend the RFQ preset's single selection. Use the checkboxes, Shift for a range, or Command/Ctrl to toggle rows. Right-click a selected row, or press Shift+F10 from it, to act on the selection; an unselected row targets just itself. Enter or a double-click activates a row. This example prints the requested action below the grid; your handler opens a ticket or sends a command.

<!-- demo: data-grid-selection -->

## Totals for the view

Each `footer` function receives all rows in the filtered view, including rows outside the viewport. Filter out the smallest inquiry to see the count fall from three to two and the size total from 30mm to 25mm. Keep the footer functions and filter stable between renders.

<!-- demo: data-grid-totals -->

## Store updates

Pass feed batches to `store.applyDeltas`: `patch` changes existing rows, `remove` drops expired inquiries, and `upsert` adds arrivals. Receive a batch below to step through these changes with twelve rows. The button supplies sample feed data; no clock or connection runs in the background. Prices move by one tick, with the signed change beside them.

Scroll down before receiving a batch to see the RFQ preset keep the first visible row in place when an earlier row leaves. A feed that already batches can call `applyDeltas` directly; use [`createFrameBatcher`](row-store.md#api-reference) when messages arrive individually, and cancel it when the feed disconnects.

<!-- demo: data-grid-updates -->

## API Reference

### Props

`T` is your row type; `RowId` is a string. Give the grid a container with a height. Keep unchanged `columns`, `filter`, `sort`, and rule lists stable between renders to avoid rebuilding the grid's view.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Rows from [`row-store`](row-store.md). |
| `columns` | `ColumnDef<T>[]` | Required | Column definitions; see below. |
| `label` | `string` | Required | Accessible name of the grid. |
| `preset` | `DataGridPreset` | `"blotter"` | Defaults from the preset table. |
| `view` | `RowView<T>` | Internally owned view | Supply your own membership, order, and reorder hold. |
| `filter` | `(row: T) => boolean` | None | Filter the internally owned view. |
| `rules` | `GridRules` | None | Cell and row tones, filters, and sort rules. |
| `rowHeight` | `number` | Preset | Fixed row height in px. |
| `overscan` | `number` | `8` | Extra rows rendered beyond the viewport. |
| `rowEnter` | `Partial<RowEnterBehavior>` | Preset | Override `highlight`, `pinViewport`, or `followTail` booleans. |
| `reorderHoldMs` | `number` | Preset | Delay in ms before the internally owned view reorders after interaction. |
| `announceRowCount` | `"off" \| "debounced"` | Preset | Enable the polite row-count announcement. |
| `selectionMode` | `"none" \| "single" \| "multi"` | Preset | Selection behavior. |
| `selectionColumn` | `boolean` | `false` | Show checkboxes in multi-select mode. |
| `flashWindowMs` | `number` | `900` | Cell flash duration in ms. |
| `footer` | `Record<string, (rows: T[]) => string>` | None | Totals keyed by column key. |
| `onEdit` | `(change: EditChange<T>) => void \| Promise<unknown>` | None | Handle commits; enables columns with `edit`. |
| `onRowActivate` | `(row: T, id: RowId) => void` | None | Handle Enter or a double click when it does not edit a cell. |
| `renderContextMenu` | `(rows: T[], ids: RowId[]) => ReactNode` | None | Menu items for the selection or targeted row. |
| `getRowProps` | `(row: T, id: RowId) => RowDecoration \| undefined` | None | Row classes, state, tone, and accessible description. |
| `emptyState` | `ReactNode` | `"No rows"` | Empty-view content. |
| `className` | `string` | None | Classes on the grid root. |
| `initialRect` | `{ width: number; height: number }` | None | Viewport size in px before measurement, for tests or server rendering. |

`RowDecoration` accepts optional string fields: `className`, `data-state`, `data-rule`, `data-tone`, and `aria-description`.

### State and callbacks

Omit a state prop to let the grid manage it. Pass it to control that state, and apply changes from its callback. Callbacks also work with internal state.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `columnState` | `ColumnState` | `{ order: [], widths: {}, hidden: [] }` | Column keys in order, widths in px by key, and hidden keys. |
| `onColumnStateChange` | `(state: ColumnState) => void` | None | Receive column changes and resets. |
| `sort` | `SortState` | `null` | `{ key: string, dir: "asc" \| "desc" }` or no header sort. |
| `onSortChange` | `(sort: SortState) => void` | None | Receive header sort changes. |
| `selection` | `ReadonlySet<RowId>` | Empty set | Selected rows. |
| `onSelectionChange` | `(selection: ReadonlySet<RowId>) => void` | None | Receive selection changes. |
| `focusedRowId` | `RowId \| null` | `null` | Focused row. |
| `onFocusedRowChange` | `(id: RowId \| null) => void` | None | Receive row focus changes. |

### Columns

Each `ColumnDef<T>` describes one column. Frozen columns stay on the left, before the other columns regardless of `columnState.order`.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `key` | `string` | Required | Column identity for state, rules, and edits. |
| `header` | `ReactNode` | Required | Header content. |
| `width` | `number` | Required | Initial width in px. |
| `accessor` | `(row: T) => unknown` | Required | Value used for display, sorting, rules, and flash direction. |
| `minWidth` | `number` | `48` | Minimum width in px. |
| `align` | `"left" \| "right" \| "center"` | Right if numeric, otherwise left | Text alignment. |
| `frozen` | `"left"` | None | Keep the column visible during horizontal scrolling. |
| `sortable` | `boolean` | `false` | Enable header sort controls. |
| `hidden` | `boolean` | `false` | Hide the column regardless of column state. |
| `format` | `(value: unknown, row: T) => string` | `String(value)`; nullish values use `NULL_TOKEN` | Display text. |
| `cell` | `(ctx: { row: T; value: unknown; rowId: RowId; edit?: CellEditHandle }) => ReactNode` | Formatted text | Custom content; flashes still follow the accessor. |
| `numeric` | `boolean` | `false` | Numeric typography, alignment, and default flashing. |
| `font` | `"numeric" \| "mono"` | `"numeric"` | Font family for numeric cells. |
| `flash` | `false \| "fill" \| "ring"` | Preset for numeric columns; otherwise `false` | Override or disable cell flashes. |
| `parse` | `(text: string) => unknown` | Number if numeric; otherwise text | Read values in grid rules. Separate from `edit.parse`. |
| `edit` | `CellEdit<T>` | None | Editing behavior; also requires the grid's `onEdit`. |

Numeric cells carry `data-numeric` and use lining, tabular figures in `--tradecn-font-numeric`. Use `font: "mono"` for fraction quotes such as `99-16+` so their punctuation aligns too. [`typography`](typography.md) explains the choice; `numericFontClass` in [`format`](format.md) selects it from an instrument convention.

### Presets

| Preset | Height (px) | Selection | Flash | Hold (ms) | Highlight arrivals | Viewport | Announce count |
|---|---|---|---|---|---|---|---|
| `blotter` | 24 | Multi | Fill | 750 | Yes | Pin | Yes |
| `watchlist` | 22 | Single | Fill | 0 | No | Unpinned | No |
| `rfq` | 26 | Single | Ring | 1,000 | Yes | Pin | Yes |
| `option-chain` | 20 | None | Ring | 0 | No | Unpinned | No |
| `tape` | 22 | Single | Fill | 0 | Yes | Follow tail | Yes |
| `parameters` | 24 | Single | Ring | 0 | No | Pin | No |

Override behavior with the corresponding props and each column's `flash`; override the presets' `text-xs` size through `className`. [`watchlist`](watchlist.md), [`blotter`](blotter.md), and [`parameter-grid`](parameter-grid.md) build on these presets.

### How it stays inside the frame

Rows subscribe individually through `useRow`. A value update that leaves the view's membership and order unchanged re-renders the affected visible row without re-rendering the other rows. React batches notifications from one `applyDeltas` call. Sorting, filtering, and footer totals can also do work for that batch.

TanStack Virtual positions fixed-height rows. With `pinViewport`, arrivals or removals adjust `scrollTop` by the first visible row's change in index times `rowHeight`, provided that row remains in the view.

Flash memory is keyed by row and column. A cell returning with the same value resumes a flash only while its window remains open. Reduced motion uses a static mark instead of animation. The install adds `up`, `down`, `flat`, `stale`, and `expiring` tokens and their soft variants if absent; flashes use the first three, and rules can use all five.

### The reorder hold

Grid key events outside the cell editor and pointer presses in the scroll area call `view.touch()`. During the hold, existing rows keep their relative order, new rows append, and removed or filtered-out rows leave. The view sorts again when the hold expires, even without another feed update.

The `reorderHoldMs` prop configures the internally owned view. With a supplied `view`, configure its hold yourself; the grid still calls `touch()` on it.

### Following the tail

Use `tape` for append-only feeds, or set `rowEnter={{ followTail: true, pinViewport: false }}` on another preset. Row-entry overrides merge with the preset, so turn pinning off explicitly when switching from it.

The viewport moves to the end when following is enabled and as rows arrive. Grid keys, pointer presses in the scroll area, or scrolling away pause following. An `N new` button counts the increase in row count since the pause; click it or scroll to the end to resume. For feeds that also remove rows, this count is net growth, not total arrivals.

### Footer totals

`footer={{ size: (rows) => formatQuantity(sum(rows)) }}` adds a sticky totals row. Each function receives all rows in the filtered, ordered view, including rows outside the viewport. Only displayed columns with a footer function get a value.

Totals calculate on mount and subscribe to store batches. Changes to the view's ids, resolved columns, `footer` object, or store also recompute them. Keep `footer` stable between renders. Totals have no per-frame timer or flash and retain the column's numeric typography and alignment.

### Rules as data

[`grid-rules`](grid-rules.md), installed alongside the grid, supplies `GridRules`: plain data for tones, filtering, and ordering.

| Rule | Internally owned view | Supplied `view` |
|---|---|---|
| `rules.columns` | Color cells and rows | Color cells and rows |
| `rules.filter` | Every rule must pass, along with `filter` | Ignored, as is `filter` |
| `rules.sort` | Break ties after the header sort; provide the order when no header sort is set | Ignored; the view owns the order |

A supplied view also ignores `sort` for ordering. Header controls can still report changes through `onSortChange` for you to apply.

String rule values use the column's `parse` when provided, for example `parse: (text) => parsePrice(text, convention)`. Numeric and boolean values bypass it. Matched cells and rows carry `data-rule`, `data-tone`, and an accessible description. `getRowProps` takes precedence over row decorations; a cell's rejection message takes precedence over its rule description.

### Editing in place

Give the grid `onEdit` and the column a `CellEdit<T>`:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `parse` | `(text: string, row: T) => unknown` | Required | Return a value or `editProblem("…")`. |
| `format` | `(value: unknown, row: T) => string` | Column formatter or `String(value)`; blank for nullish values | Editor and pending text. |
| `validate` | `(value: unknown, row: T) => EditProblem \| null \| undefined` | None | Return a problem to refuse the value. |
| `step` | `(value: unknown, dir: 1 \| -1, big: boolean, row: T) => unknown` | None | Return the next value for Up or Down; Shift sets `big`. |
| `toggle` | `(value: unknown, row: T) => unknown` | None | Return a value to commit without opening an editor. |
| `canEdit` | `(row: T) => boolean` | Returns `true` | Make individual cells read-only with `false`. |

Use `big` to implement a larger step, such as ten ticks with Shift; the grid does not multiply it. A cell refused by `canEdit` carries `aria-readonly="true"`. [`parameter-grid`](parameter-grid.md) builds a parameter sheet on this API.

Only one text editor opens at a time. A failed parse or validation leaves it open with an accessible error; leaving the editor instead discards invalid input and commits valid input. A value equal to the store's current value sends nothing.

A commit calls `onEdit` with `{ rowId, key, value, previous, row }`. The grid never writes the store. Its default renderer shows the committed text muted with `data-pending` until the store value matches it or the returned promise resolves. Resolution clears pending state and displays the current store value, which may still be the old value. Returning nothing leaves the edit pending until the store matches.

A thrown error or rejection of a still-pending promise displays the store value with the error message, `data-rejected`, and destructive styling. Reopening the editor clears the error. A pending cell can also be reopened, starting from its committed text.

A custom `cell` receives `edit: { status, commit(value), open() }` when editing is enabled for its column. It sees `status` as absent or an object whose `kind` is `pending` or `rejected`. While a text editor is open, the grid renders its built-in editor instead of calling `cell`. The renderer chooses its content and can disable its control while pending; `commit(value)` validates and sends the value without parsing text.

### Identity

Selection, focus, and context-menu targets use row ids, so a reorder preserves their identity. `aria-activedescendant` names the focused row while its id is in the view; each data row's `aria-rowindex` is its zero-based view index plus two, accounting for the header.

With announcements enabled, a 1,000 ms timer reports the row count through a polite live region, for example "1,024 rows, 12 new". It starts on mount and restarts when the count changes. Continuous count changes delay the announcement.

### Keyboard

With focus in the grid, outside a text editor:

| Key | Action |
|---|---|
| Up / Down | Move row focus. |
| PageUp / PageDown | Move row focus by a viewport. |
| Home / End | Focus the first / last row. |
| Shift + a row navigation key | Extend selection in multi-select mode. |
| Left / Right | Move column focus. |
| Space | Toggle selection in multi mode; select in single mode. On an editable toggle cell, commit its toggle instead. |
| Enter | Edit the focused editable cell, including toggles; otherwise activate the row. |
| F2 | Edit the focused editable cell, including toggles. |
| Type a character other than Space | Open an editable text cell with that character. Toggle cells and Ctrl, Cmd, or Alt combinations do not open an editor. |
| Escape | Clear selection. |
| Ctrl or Cmd+A | Select all rows in the view in multi mode. |
| Alt+Left / Right | Move the focused column. |
| Alt+Shift+Left / Right | Resize the focused column by 8 px. |
| Alt+S | Cycle a sortable column: ascending, descending, off. |
| Alt+H | Hide the focused column. |
| Shift+F10 / Menu | Open the context menu on the focused row. |

Row navigation also selects the focused row in single-select mode. A double click opens an editable text cell or activates the row. Each column header has move, hide, and reset controls, plus a resize handle. Sort controls appear only when the column has `sortable: true`.

Inside a text editor:

| Key | Action |
|---|---|
| Enter | Commit and return focus to the grid. |
| Escape | Discard the edit and return focus to the grid. |
| Tab / Shift+Tab | Commit and open the next / previous editable text cell in the row, skipping toggles. At either end, return focus to the grid. |
| Up / Down | Call `step` with direction `1` / `-1`. Shift sets `big: true`. |
| Ctrl, Cmd, or Alt + Up / Down | Leave the event to listeners above the grid, such as a hotkey registry. |

Opening an editor selects its text unless you opened it by typing a character.

### What it does not do

The grid does not fetch data, group rows, render trees, paste multiple cells, support variable row heights, or persist state. Feed the store and save state through the callbacks; edits remain commands for your application to handle.
