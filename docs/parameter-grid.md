# ParameterGrid

Edit parameters by instrument, tier, or pair, with pending values, server-controlled enable checkboxes, and the time each row last changed.

## Usage

```tsx
import { useState } from "react"
import { createRowStore } from "@/lib/row-store"
import { ParameterGrid, type ParameterDef, type ParameterRow } from "@/components/ui/parameter-grid"

interface Sheet extends ParameterRow {
  skew: number | null
}

const parameters: ParameterDef<Sheet>[] = [
  { key: "skew", header: "Skew", accessor: (row) => row.skew, step: 0.25, min: -5, max: 5 },
]

function PricingParameters() {
  const [store] = useState(() => {
    const store = createRowStore<Sheet>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: [
      { id: "zn", name: "ZN", enabled: true, allowedActions: ["toggle", "edit"], skew: 0.5 },
      { id: "zb", name: "ZB", enabled: false, allowedActions: ["toggle", "edit"], skew: null },
    ] })
    return store
  })

  return (
    <div className="h-40 w-fit max-w-full">
      <ParameterGrid store={store} parameters={parameters} label="Pricing parameters" asOf={false} onEdit={(change) => {
        store.applyDeltas({ patch: [{ id: change.rowId, fields: { [change.key]: change.value, updatedAt: Date.now(), updatedBy: "you" } as Partial<Sheet> }] })
      }} />
    </div>
  )
}
```

Seed the row store, define the parameter, and grant each row the actions it may take. This example acknowledges edits immediately by writing the requested value back to the store. Your application sends the request and applies the server's response.

Double-click a Skew value, or focus its cell and press Enter, to edit. Press Enter to commit or Escape to cancel. Up and Down step by 0.25; Shift uses ten steps. Values outside −5 through 5 stay in the editor with an error. Blank input becomes null. The enable checkbox also sends an edit request, and the Updated column records each accepted change.

The preview alignment controls keep an edge fixed while resizing columns and save that choice across examples.

## Pending values and server replies

Commit a Width edit with Enter, or toggle ZN, then choose **Receive replies**. Until then, numeric edits stay pending and the checkbox keeps the store's value. Each press handles the queued requests in order. This example supplies the reply control so you can inspect pending states without a timer.

A Width over 8 is refused: the cell returns to the stored value and shows **Over 8**. Reopen it to clear the error and try again. Accepted requests update the row, its timestamp and author, and the as-of time. The changed-since marker identifies rows accepted during this session. The status shows the queue size and counts accepted and refused requests from the last set of replies.

<!-- demo: parameter-grid-server -->

## Permissions and read-only parameters

ZN permits both edits and enable requests. ZB permits edits but cannot be enabled here. ZT permits neither. The Hedge ratio column is read-only on every row, independently of those permissions.

The permissions come from each row's `allowedActions`; `readOnly` comes from the parameter definition. Enabled state is separate from permission: ZB's Skew is editable even while its enable checkbox is off.

<!-- demo: parameter-grid-permissions -->

## API Reference

Uses the data grid's `parameters` preset: 24 px rows, single selection, ring flashes for numeric changes, and no reorder hold. The default columns are the name frozen on the left, the enable checkbox, one column per parameter, and the updated time. All are sortable.

### Props

`ParameterGridProps<T>` requires `T extends ParameterRow`. It inherits [`DataGridProps<T>`](data-grid.md) except `preset`, `columns`, `label`, and `onEdit`; the latter three have the definitions below. Other inherited props, including sorting, column state, and preset overrides such as `rowHeight`, pass to the grid.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Rows and batch metadata. |
| `parameters` | `readonly ParameterDef<T>[]` | Required | Parameter columns in display order. |
| `onEdit` | `(change: EditChange<T>) => void \| Promise<unknown>` | Required | Send a value or enable request to the server. |
| `columns` | `ColumnDef<T>[]` | `parameterColumns(options)` | Replace the generated column list. |
| `label` | `string` | `"Parameters"` | Accessible name for the grid. |
| `labels` | `Partial<ParameterGridLabels>` | `DEFAULT_PARAMETER_GRID_LABELS` | Override the labels listed below. |
| `time` | `(ms: number) => string` | Local 24-hour `HH:MM:SS` | Format updated and as-of times. |
| `changedSince` | `number \| null` | `null` | Mark rows updated at or after this epoch time in milliseconds. |
| `toggleAction` | `string` | `"toggle"` | Permission id for the enable checkbox. |
| `editAction` | `string` | `"edit"` | Permission id for parameter edits. |
| `asOf` | `boolean` | `true` | Show the as-of line above the grid. |
| `getRowProps` | `(row: T, id: RowId) => RowDecoration \| undefined` | None | Decorate rows; a supplied `aria-description` takes precedence over the changed label. |
| `className` | `string` | None | Additional classes on the outer wrapper. |

`parameterColumns(options)` returns `ColumnDef<T>[]` to add, drop, or reorder in your own list. Its `ParameterColumnOptions<T>` accepts `parameters`, `labels`, `time`, `changedSince`, `toggleAction`, and `editAction` with the defaults above. A supplied `columns` list replaces the generated columns and their formatting, permissions, and controls.

The install shares byte-identical grid, store, and format files with `data-grid`, `watchlist`, `blotter`, and `rfq-stack`.

### Rows

Extend `ParameterRow` with the fields your accessors read:

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | `string` | Yes | Row identity; use it in the store's `getRowId`. |
| `name` | `string` | Yes | Frozen name column and checkbox label. |
| `enabled` | `boolean` | No | Checkbox is checked only when this is `true`. |
| `allowedActions` | `readonly string[]` | No | Allowed action ids; an absent or empty list permits nothing. |
| `updatedAt` | `number \| null` | No | Last change in milliseconds since the epoch. |
| `updatedBy` | `string \| null` | No | Name shown beside a present updated time. |

### The sheet is the server's

The grid reads your store and never writes it. A valid commit calls `onEdit` with `{ rowId, key, value, previous, row }`, where `previous` is the current accessor value and `row` is the current store row. Committing that same value sends nothing.

A parameter cell shows the committed text muted and italic while pending. Pending clears when the store's accessor value matches the committed value (`Object.is`), or when the returned promise resolves. Resolution displays the current store value, which may still be the old value. Returning nothing leaves the cell pending until the store matches.

A thrown error or rejection of a still-pending promise displays the current store value with the error message in the cell and its `aria-description`. Reopening clears the error. A pending parameter cell can also reopen, starting from its committed text.

### Parameters

Each `ParameterDef<T>` defines one column:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `key` | `string` | Required | Column key, sent in `onEdit`. |
| `header` | `string` | Required | Column heading and editor's accessible name. |
| `accessor` | `(row: T) => unknown` | Required | Read the value for display, sorting, and acknowledgement. |
| `width` | `number` | `96` | Column width in pixels. |
| `format` | `(value: unknown, row: T) => string` | Default formatter | Text for the cell, editor, pending value, and range errors. |
| `parse` | `(text: string, row: T) => unknown` | Numeric parser | Return a value or `editProblem("…")`. |
| `validate` | `(value: unknown, row: T) => EditProblem \| null \| undefined` | None | Return a problem to refuse a value after range checks. |
| `step` | `number \| ((value: unknown, dir: 1 \| -1, big: boolean, row: T) => unknown)` | None | Change the editor value with Up or Down. |
| `min` / `max` | `number` | No bounds | Inclusive limits for numeric values. |
| `decimals` | `number` | `2` | Decimal places in the default formatter. |
| `numeric` | `boolean` | `true` | Right alignment, numeric font, decimal input mode, and directional flashes. |
| `font` | `"numeric" \| "mono"` | `"numeric"` | Font family for numeric cells; both use tabular figures. |
| `readOnly` | `boolean` | `false` | Omit editing for this parameter on every row. |

The default formatter prints finite numbers to `decimals` places, null, undefined, or nonfinite numbers as `–`, and other values as text. The default parser trims whitespace, removes commas, accepts the typographic minus `−`, and reads a finite number; blank input becomes null. `numeric: false` changes presentation but keeps this parser. For text, supply a parser such as `parse: (text) => text.trim()`.

`min` and `max` apply only to numeric values and use the column's formatter in error messages. `validate` runs after those checks. A numeric `step` moves by that amount, ten times with Shift, starting from zero for a nonnumeric value. A function receives direction `1` or `-1` and `big: true` with Shift; it returns the next value. Stepping does not clamp to bounds; validation runs when committing. Without `step`, Up and Down leave the editor value unchanged.

`parameterEdit(def, editAction, labels?)` builds a `CellEdit<T>` for a custom column. `editAction` is required; `labels` defaults to `DEFAULT_PARAMETER_GRID_LABELS` and accepts a complete `ParameterGridLabels` object.

### Editing

Enter, F2, a double click, or typing a non-space character opens an editable parameter cell. Opening selects its text unless you typed a character. Enter commits; Escape discards; Tab and Shift+Tab commit and open the next or previous editable text cell in the row, skipping the checkbox. At either end, focus returns to the grid.

A parse or validation failure on commit keeps the editor open with an accessible error and sends nothing. Leaving the editor commits valid input and discards invalid input. Only one text editor opens at a time.

Up and Down step when configured. Ctrl, Cmd, or Alt with those arrows passes through to listeners above the grid. See the [data-grid keyboard reference](data-grid.md) for navigation and column controls.

### The enable box

The checkbox stays checked according to the store's `enabled` value. Pressing it calls `onEdit` with `key: "enabled"` and the opposite boolean. It is disabled while pending; the acknowledgement and error rules above apply. The grid's Space, Enter, and F2 keys on that cell can send the same request, including while pending.

The checkbox uses your installed checkbox component and stays outside the tab order. Its accessible name describes the request, such as `Enable ZN` or `Disable ZN`.

### What the server allows

A row's `allowedActions` must include `toggleAction` to enable the checkbox and `editAction` to permit parameter edits, as in [`blotter`](blotter.md) and the tickets. `allowsAction(row, action)` checks membership and returns false for a missing list.

Cells blocked by permissions carry `aria-readonly="true"` when they have an edit definition. A parameter with `readOnly: true` has no edit definition and cannot open an editor, regardless of row permissions.

### Changed since

Rows with a present `updatedAt` at or after `changedSince` show a dot beside their name and receive the `Changed` accessible description, unless `getRowProps` supplies one. A null or omitted `changedSince` disables the mark.

The updated column shows `updatedAt` and a nonempty `updatedBy`, with a fill flash when the timestamp changes. A missing timestamp displays `–`.

The as-of line shows the store's latest supplied `producedAt`, falling back to `lastBatchAt` when none has been supplied. Before either exists, it shows `–`. Both timestamps are milliseconds since the epoch and use the `time` formatter. Set `asOf={false}` to hide the line.

### Labels

`labels` merges partial overrides into `DEFAULT_PARAMETER_GRID_LABELS`:

| Label | Default | Substitutions |
|---|---|---|
| `name` / `enabled` / `updated` | `Name` / `On` / `Updated` | None |
| `enable` / `disable` | `Enable {name}` / `Disable {name}` | Row name |
| `changed` | `Changed` | None |
| `asOf` | `As of {time}` | Formatted batch time |
| `notANumber` | `Not a number.` | None |
| `belowMin` | `{n} is below the minimum of {min}.` | Formatted value and minimum |
| `aboveMax` | `{n} is above the maximum of {max}.` | Formatted value and maximum |

Parameter headers, custom validation messages, and server errors come from your definitions and callbacks.

### What it does not do

Your application owns values, persistence, and server requests. Multi-cell paste and row grouping are not supported; use one grid per book.

### Tokens

The install adds the grid's tokens, `up`, `down`, `flat`, `stale`, and `expiring` with their soft variants, if you do not have them.
