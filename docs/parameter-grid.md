# ParameterGrid

A parameter table on the data grid: one row per instrument, tier, or pair, the values typed in place and held pending until the server's row comes back with them, an enable box that asks the server and never flips itself, and when each row last changed.

## Usage

```tsx
import { ParameterGrid, type ParameterDef, type ParameterRow } from "@/components/ui/parameter-grid"
import { createRowStore } from "@/lib/row-store"
```

```tsx
interface Sheet extends ParameterRow {
  skew: number | null
  width: number
  maxSize: number
}

const PARAMETERS: ParameterDef<Sheet>[] = [
  { key: "skew", header: "Skew", accessor: (r) => r.skew, step: 0.25, min: -5, max: 5 },
  { key: "width", header: "Width", accessor: (r) => r.width, step: 0.5, min: 0 },
  { key: "maxSize", header: "Max size", accessor: (r) => r.maxSize, decimals: 0, readOnly: true },
]

const store = createRowStore<Sheet>({ getRowId: (r) => r.id })

<ParameterGrid store={store} parameters={PARAMETERS} onEdit={(change) => api.setParameter(change.rowId, change.key, change.value)} changedSince={sessionOpenedAt} />
```

## API Reference

It is the data grid in its `parameters` preset (24 px rows, single select, a ring flash on a change, no reorder hold) with the columns a parameter table has: the row's name frozen on the left, the enable box, one column per parameter, and when the server last changed the row. Every `DataGrid` prop passes through except `preset`; sorting, column state, and the keyboard are [`data-grid`](data-grid.md)'s. If you already installed `data-grid`, `watchlist`, `blotter`, or `rfq-stack`, the shared files are byte-identical and nothing of yours changes.

### The sheet is the server's

Rows are whatever is in the store you pass, and a value on the screen is what the server holds. An edit is a command: the grid hands it to `onEdit` as `{ rowId, key, value, previous, row }` and shows what was typed as pending, muted in the cell, until a later batch brings the row's value to it or the promise you return resolves. A rejected promise keeps the previous value and prints the message in the cell, so a trader sees what the server said where they typed. Nothing here writes to the store, and a pending cell is a question the server has not answered, not a fact.

### Parameters

A `ParameterDef` is `{ key, header, accessor, format?, parse?, validate?, step?, min?, max?, decimals?, numeric?, font?, readOnly? }`. A parameter is numeric unless you say otherwise: right-aligned, set in tabular figures, printed to `decimals` places (two by default), read with thousands separators allowed and a blank as null. `min` and `max` are checked before a commit and said in the column's own format; `validate` runs after them for a rule of your own. `step` as a number is what the arrows move by in the editor, ten times that with Shift; as a function it is the grid's own `step`. `readOnly` shows a value and never opens it. `parameterEdit(def, editAction)` is the grid's `edit` built from one definition, and `parameterColumns(options)` the whole column list, to spread into your own.

### Editing

Enter, F2, a double click, or typing on a cell opens it, with the text selected or with the character typed. Enter commits, Escape reverts, Tab and Shift+Tab commit and open the next or previous editable cell in the row, bare Up and Down step. A modifier-held arrow is left alone, so a `mod+up` bound above the grid reaches its registry from inside a cell. A value that does not read, or fails `min`, `max`, or `validate`, keeps the editor open with the sentence on it and sends nothing. The keys are the grid's; [`data-grid`](data-grid.md) has the whole list.

### The enable box

`enabled` is the server's word on whether a row is in force, drawn as your checkbox, and the box never flips itself. A press asks through `onEdit` with `key: "enabled"` and the box is disabled until the row comes back, or the promise resolves; from the keyboard, Space or Enter on the cell asks the same. The name of the box says what a press does, `Enable ZN` or `Disable ZN`.

### What the server allows

A row's `allowedActions` names what may be done to it, by id, the way [`blotter`](blotter.md) and the tickets read theirs: the toggle action (`toggle` by default, `toggleAction` to rename) lets the box ask, the edit action (`edit`, `editAction`) lets a value be typed. A row with no list allows nothing: its box is disabled and its cells are read-only, and say so with `aria-readonly`. A read-only parameter is read-only on every row.

### Changed since

Pass `changedSince`, a moment, and every row whose `updatedAt` is at or after it wears a dot beside its name and says `Changed` to a screen reader. The updated column prints when the server last changed the row and who did, from `updatedAt` and `updatedBy`, and flashes when it moves. The line above the grid prints the store's `producedAt`, the moment the server's newest message was made, so a sheet that has stopped updating says so; `asOf={false}` hides it.

### Labels

Every word is in `labels`, a partial of `DEFAULT_PARAMETER_GRID_LABELS`: the name and enable headers, the box's two names, the updated header, the changed word, the as-of line, and the three sentences the default parse and range check say.

### What it does not do

It does not decide a value, flip a row, keep the sheet, or paste a range of cells; one cell is edited at a time. Grouping rows into books is one grid per book.

### Tokens

The install adds the grid's tokens, `up`, `down`, `flat`, `stale`, and `expiring` with their soft variants, if you do not have them.
