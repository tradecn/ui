# ColumnChooser

Show, hide, reorder, and find one grid's columns, or reset their widths, through the grid's own column state. Use the dialog or embed the inline panel.

## Usage

```tsx
import { useState } from "react"
import { createInstrumentFormatter, formatNotional } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"
import { ColumnChooser } from "@/components/ui/column-chooser"
import { DataGrid, type ColumnDef, type ColumnState } from "@/components/ui/data-grid"

type Quote = { id: string; client: string; size: number; price: number }
const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const columns: ColumnDef<Quote>[] = [
  { key: "client", header: "Client", width: 112, accessor: (row) => row.client },
  { key: "size", header: "Size", width: 96, numeric: true, accessor: (row) => row.size, format: (value) => formatNotional(value as number, { unit: "mm" }) },
  { key: "price", header: "Price", width: 96, numeric: true, font: "mono", accessor: (row) => row.price, format: (value) => ust.price(value as number), parse: ust.parsePrice },
]

function QuoteColumns() {
  const [store] = useState(() => {
    const rows = createRowStore<Quote>({ getRowId: (row) => row.id })
    rows.applyDeltas({ upsert: [
      { id: "Q-1", client: "ALPHA", size: 5_000_000, price: 99.5 },
      { id: "Q-2", client: "BETA", size: 10_000_000, price: 99.515625 },
    ] })
    return rows
  })
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
  const [open, setOpen] = useState(false)

  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setOpen(true)}>Columns</button>
      </div>
      <div className="flex min-h-104 w-fit max-w-full flex-col justify-center">
        <ColumnChooser open={open} onOpenChange={setOpen} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} className="max-h-[calc(100%-2rem)] grid-cols-1 overflow-auto" />
        <div className="h-40">
          <DataGrid store={store} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} label="Quotes" />
        </div>
      </div>
    </>
  )
}
```

The grid and dialog share one `ColumnState` and callback. Open **Columns** to search, show or hide columns, or change their order. Close the dialog to see the grid update. Resize a grid header, then reopen the chooser to inspect or reset that width. **Reset all** restores the column definitions.

The preview alignment control is shared across pages and remembered. Choose left alignment to keep the grid in place while changing its width. The dialog scrolls when its controls need more room.

## Composition

`ColumnChooser` wraps the panel in your shadcn dialog with a title and description. Pass `open` and accept `onOpenChange` to handle dismissal by Escape or the overlay.

`ColumnChooserPanel` embeds the same list in a sheet, settings page, or tab; [`rules-editor`](rules-editor.md) uses it for its Columns tab. It needs no dialog state. Share `columns`, `columnState`, and `onColumnStateChange` with the grid.

## Inline settings and rule labels

Use `ColumnChooserPanel` when column settings belong in your own panel. This example starts with Client hidden and Price widened to 144 px. Show Client, move it below Price, or reset the saved width. The frozen RFQ stays in its group.

The Price badge describes a configured rule in words; the panel displays that rule but does not edit or apply it. Pass the same column rules to the grid when composing them. The inline container scrolls horizontally on narrow screens so its controls remain available.

<!-- demo: column-chooser-inline -->

## API Reference

### Props

Both components use `ColumnChooserPanelProps<T>`, where `T` is the grid's row type. `ColumnChooserProps<T>` adds the dialog inputs below.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `columns` | `ColumnDef<T>[]` | Required | Column definitions shared with the grid. |
| `columnState` | `ColumnState` | Required | Controlled order, width overrides, and hidden keys. |
| `onColumnStateChange` | `(state: ColumnState) => void` | Required | Receives edits; accept them into `columnState`. |
| `rules` | `ColumnRule[]` | Omitted | Highlight rules shown beside their columns. |
| `labels` | `Partial<ColumnChooserLabels>` | `DEFAULT_COLUMN_CHOOSER_LABELS` | Overrides the chooser's labels. |
| `className` | `string` | Omitted | Dialog content classes for `ColumnChooser`; outer group classes for `ColumnChooserPanel`. |

Additional inputs required by `ColumnChooser`:

| Prop | Type | Purpose |
|---|---|---|
| `open` | `boolean` | Controlled dialog visibility. |
| `onOpenChange` | `(open: boolean) => void` | Receives dialog visibility changes. |

### The grid's state is the only state

The chooser emits `ColumnState` edits without applying or persisting them itself. Accept each edit into the state shared with the grid. It keeps only transient search and drag state. Replace changed objects and arrays: rows are memoized by `columns`, `columnState`, and `rules` references.

`chooserRows(columns, columnState, rules)` lists frozen columns first, then the rest, ordered by `columnState.order` within each group. Unlisted keys follow in definition order. Columns hidden through state keep their places; columns with `hidden: true` in their definition are excluded and cannot be shown here.

Search matches the column's name or key by case-insensitive substring, ignoring surrounding query spaces. A nonblank string header supplies the name; otherwise the key does. Search filters the list without changing column state.

### Show and hide

Each row has a `Show <column>` checkbox. `setColumnVisible` adds an unchecked column's key to `hidden` or removes a checked one's key. The count above the list includes state-hidden columns even when search excludes them; definition-hidden columns do not count.

`Reset all` emits `EMPTY_COLUMN_STATE`: `{ order: [], widths: {}, hidden: [] }`, the same reset as the grid header's `Reset columns`. It is disabled when `isDefaultColumnState` finds all three fields empty.

### Reorder

Drag a row onto another to take its place, shifting the rows between them. Alt+Up/Down on a focused row moves it one place; each row also has `Move up` and `Move down` buttons.

`moveColumnTo` and `moveColumnBy` refuse moves across the frozen boundary. Move buttons are disabled at either end of each group. Moves use the full chooser order, including state-hidden columns and search-excluded rows, and write that order to the new state. A refused move emits no change.

### Widths

Each row prints `columnState.widths[key] ?? column.width` in pixels using the numeric class. The chooser does not clamp that value; the grid renders at least `column.minWidth ?? 48` pixels.

`Reset width` appears when the state holds an override. It calls `resetColumnWidth` to remove that key, restoring the definition's width subject to the grid's minimum. Resize in the grid by dragging the header handle or pressing Alt+Shift+Left/Right with a column focused; the chooser has no width field.

### Rules in words

Pass the `columns` list from [`grid-rules`](grid-rules.md) as `rules`. Each matching column gets a badge in the rule's tone, using its trimmed, nonblank label or `describeRule` text. The tooltip always uses `describeRule`. Badges also appear on state-hidden columns so their configured highlights can be read without relying on color.

### A dialog is a wall

With [`use-hotkeys`](use-hotkeys.md), focus inside a dialog reaches only scopes declared inside that dialog. Typing in its search box does not fire the grid's single-key bindings underneath. The inline panel has no dialog boundary of its own.

### Labels

`labels` overrides the title, description, search box, `Show` prefix, `frozen` and `hidden` words, width label and reset, move buttons, `Reset all`, empty message, and drag hint. The default title is `Columns`, search is `Find a column`, and empty message is `No column matches.` The panel is a `group` named by the title; each row is named by its column.

The `px` suffix and move-arrow symbols are fixed. Any close-button text comes from your shadcn dialog, not these labels.

### What it does not do

Column definitions, resizing, and persistence belong to the caller and grid. The chooser only edits the supplied column state.

### Tokens

The install adds the grid's `up`, `down`, `flat`, `stale`, and `expiring` tokens with their soft variants if missing. Rule badges use them; `primary` and `destructive` use the host theme's tokens.
