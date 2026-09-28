# ColumnChooser

Compose controls for one grid's column visibility, order, and widths.

## Usage

```tsx
import { useState, type ReactNode } from "react"
import { createInstrumentFormatter, formatNotional } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ColumnChooser, ColumnChooserFrozen, ColumnChooserHiddenCount, ColumnChooserItem, ColumnChooserMove, ColumnChooserName, ColumnChooserResetAll, ColumnChooserResetWidth, ColumnChooserRule, ColumnChooserSearch, ColumnChooserVisibility, ColumnChooserWidth, DEFAULT_COLUMN_CHOOSER_LABELS, useColumnChooser, type ColumnChooserProps } from "@/components/ui/column-chooser"
import { DataGrid, type ColumnDef, type ColumnState } from "@/components/ui/data-grid"

type Quote = { id: string; client: string; size: number; price: number }
const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const columns: ColumnDef<Quote>[] = [
  { key: "client", header: "Client", width: 112, accessor: (row) => row.client },
  { key: "size", header: "Size", width: 96, numeric: true, accessor: (row) => row.size, format: (value) => formatNotional(value as number, { unit: "mm" }) },
  { key: "price", header: "Price", width: 96, numeric: true, font: "mono", accessor: (row) => row.price, format: (value) => ust.price(value as number), parse: ust.parsePrice },
]

export default function ColumnChooserDemo() {
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
    <ColumnSettingsDialog open={open} onOpenChange={setOpen} columns={columns} columnState={columnState} onColumnStateChange={setColumnState}>
      <div data-demo-controls className="text-xs">
        <DialogTrigger className="rounded border border-border px-2 py-1">Columns</DialogTrigger>
      </div>
      <div className="flex min-h-104 w-fit max-w-full flex-col justify-center">
        <div className="h-40">
          <DataGrid store={store} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} label="Quotes" />
        </div>
      </div>
    </ColumnSettingsDialog>
  )
}

export function ColumnSettingsDialog<T>({ open, onOpenChange, className, children, ...props }: Omit<ColumnChooserProps<T>, "children"> & { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  const labels = { ...DEFAULT_COLUMN_CHOOSER_LABELS, ...props.labels }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
      <DialogContent className={`max-h-[calc(100%-2rem)] grid-cols-1 overflow-auto sm:max-w-lg ${className ?? ""}`}>
        <DialogHeader><DialogTitle>{labels.title}</DialogTitle><DialogDescription>{labels.description}</DialogDescription></DialogHeader>
        <ColumnSettingsPanel {...props} />
      </DialogContent>
    </Dialog>
  )
}

export function ColumnSettingsPanel<T>(props: Omit<ColumnChooserProps<T>, "children">) {
  return <ColumnChooser {...props}><ColumnSettings /></ColumnChooser>
}

export function ColumnSettings() {
  const { shown, labels } = useColumnChooser()
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ColumnChooserSearch />
        <ColumnChooserHiddenCount />
        <ColumnChooserResetAll className="ml-auto">{labels.resetAll}</ColumnChooserResetAll>
      </div>
      {shown.length ? (
        <div className="overflow-x-auto">
          <ul className="flex min-w-0 flex-col gap-0.5" aria-label={labels.title}>
            {shown.map((row) => <li key={row.key}>
              <ColumnChooserItem columnKey={row.key} className="flex-wrap">
                <span className="flex min-w-52 flex-1 items-center gap-2">
                  <span aria-hidden className="cursor-grab select-none text-muted-foreground" title={labels.dragHint}>
                    <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                      <circle cx="2" cy="2" r="1.2" /><circle cx="6" cy="2" r="1.2" />
                      <circle cx="2" cy="6" r="1.2" /><circle cx="6" cy="6" r="1.2" />
                      <circle cx="2" cy="10" r="1.2" /><circle cx="6" cy="10" r="1.2" />
                    </svg>
                  </span>
                  <ColumnChooserVisibility />
                  <ColumnChooserName />
                  <ColumnChooserFrozen />
                </span>
                {row.rules.map(({ rule }, index) => <ColumnChooserRule key={`${rule.id}-${index}`} ruleIndex={index} />)}
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <ColumnChooserWidth />
                  <ColumnChooserResetWidth>{labels.resetWidth}</ColumnChooserResetWidth>
                  <span className="flex shrink-0 items-center">
                    <ColumnChooserMove direction="up" className="w-6 px-0"><span aria-hidden>▲</span></ColumnChooserMove>
                    <ColumnChooserMove direction="down" className="w-6 px-0"><span aria-hidden>▼</span></ColumnChooserMove>
                  </span>
                </span>
              </ColumnChooserItem>
            </li>)}
          </ul>
        </div>
      ) : <p className="text-muted-foreground">{labels.empty}</p>}
      <p className="text-muted-foreground">{labels.dragHint}</p>
    </>
  )
}
```

The grid and chooser share one `ColumnState`. Save this example as `column-chooser.tsx` to reuse its exported `ColumnSettingsPanel`, `ColumnSettingsDialog`, and `ColumnSettings` compositions. The install includes the shadcn Dialog used here.

## Composition

Use the following composition to build a `ColumnChooser`:

```text
Your Dialog (optional)
├── DialogTrigger
└── DialogContent
    ├── DialogHeader
    │   ├── DialogTitle
    │   └── DialogDescription
    └── ColumnChooser
        ├── Your toolbar
        │   ├── ColumnChooserSearch
        │   ├── ColumnChooserHiddenCount
        │   └── ColumnChooserResetAll
        ├── Your collection and empty state
        │   └── ColumnChooserItem
        │       ├── ColumnChooserVisibility
        │       ├── ColumnChooserName
        │       ├── ColumnChooserFrozen (optional)
        │       ├── ColumnChooserRule (optional, per rule)
        │       ├── ColumnChooserWidth
        │       ├── ColumnChooserResetWidth
        │       ├── ColumnChooserMove direction="up"
        │       └── ColumnChooserMove direction="down"
        └── Your hint or application content
```

Place the root directly in a settings page when you do not need a dialog. `useColumnChooser` supplies the rows for your collection; `useColumnChooserItem` supplies each item's readings and edit commands for custom controls.

## Inline settings and rule labels

Use cards to place descriptions beside column settings and move actions below each reading; the native visibility checkbox uses `useColumnChooserItem`.

<!-- demo: column-chooser-inline -->

## API Reference

### Props

`ColumnChooserProps<T>` extends native `div` props. Default words come from `DEFAULT_COLUMN_CHOOSER_LABELS`. The root is a group named by `labels.title`, with a programmatic focus target for fallback. Native props, refs, classes, and events pass through the public parts.

| Prop | Type | Default | Description |
|---|---|---|---|
| `columns` | `ColumnDef<T>[]` | Required | Column definitions shared with the grid. |
| `columnState` | `ColumnState` | Required | Controlled order, width overrides, and hidden keys. |
| `onColumnStateChange` | `(state: ColumnState) => void` | Required | Accept edits into the state shared with the grid. |
| `children` | `ReactNode` | Required | Your controls, collection, and surrounding content. Conditional content is supported. |
| `rules` | `ColumnRule[]` | Omitted | Highlight rules shown beside their columns. |
| `labels` | `Partial<ColumnChooserLabels>` | Default labels | Words used by readings and controls. |
| `className` | `string` | Omitted | Additional classes to apply to the root. |

### Public parts

`ColumnChooserItem` renders a focusable, draggable `div` with `role="group"`, named by its column. Place it inside your `li` or card. Keep collection keys tied to the column key. A missing or definition-hidden key renders nothing.

| Part | Inputs | Description |
|---|---|---|
| `ColumnChooserItem` | Required `columnKey: string`, `children: ReactNode`; native `div` props | Coordinates drag, keyboard reorder, and focus for one column. |
| `ColumnChooserSearch` | Installed Input props except `value` and `defaultValue` | Reads and writes the root's query. |
| `ColumnChooserHiddenCount` | Native `span` props except `children` | Prints the hidden count and its label. |
| `ColumnChooserVisibility` | Installed Checkbox props except `checked`, `defaultChecked`, and `indeterminate` | Reads and writes the item's visibility. |
| `ColumnChooserName` | Native `span` props except `children` | Prints the column name, with the full name as its title. |
| `ColumnChooserFrozen` | Installed Badge props except `children` | Prints the frozen label for frozen columns. |
| `ColumnChooserRule` | Required `ruleIndex: number`; installed Badge props except `children` | Prints the rule at this index in the item’s rule readings. Missing rules render nothing. |
| `ColumnChooserWidth` | Native `span` props except `children` | Prints the width in pixels with numeric typography. |
| `ColumnChooserResetWidth` | Required `children`; installed Button props | Removes the item's width override. Invisible, disabled, and outside the tab order without an override. |
| `ColumnChooserMove` | Required `direction: "up" \| "down"`, `children`; installed Button props | Moves within the column's frozen group. Disabled at its boundary. |
| `ColumnChooserResetAll` | Required `children`; installed Button props | Restores the default column state. Disabled when already at the default. |

Search, click, keyboard, and drag handlers run before the corresponding chooser behavior. Call `event.preventDefault()` to cancel that behavior. A visibility callback receives the installed Checkbox's arguments; use the item hook for a replacement control. Supply an accessible name when replacing an interactive part.

### Hooks

`useColumnChooser()` returns `ColumnChooserState`: full `rows`, filtered `shown`, `query`, `setQuery`, `labels`, `hiddenCount`, `isDefault`, and `reset`. Each `ColumnChooserEntry` has `key`, `name`, `visible`, `frozen`, `width`, `resized`, and `rules`. Each rule reading contains its source `rule` and computed `description`.

`useColumnChooserItem()` returns `ColumnChooserItemState`: `row`, `canMoveUp`, `canMoveDown`, `dragging`, `setVisible(visible)`, `move(-1 | 1)`, and `resetWidth()`. Both hooks require their named owner. The item coordinates drag and focus even when you replace its controls.

### The grid's state is the only state

The chooser emits `ColumnState` edits without applying or persisting them itself. Accept each edit into the state shared with the grid. It keeps transient search and drag state. Replace changed objects and arrays: rows are memoized by `columns`, `columnState`, and `rules` references.

`chooserRows(columns, columnState, rules)` returns `ChooserRow<T>[]`: frozen columns first, then the rest, ordered by `columnState.order` within each group. Unlisted keys follow in definition order. State-hidden columns keep their places; definition-hidden columns are excluded. The helper retains the source column definition for headless consumers.

Search matches the column name or key by case-insensitive substring, ignoring surrounding query spaces. A nonblank string header supplies the name; otherwise the key does. Search filters the collection without changing column state. The ordinary dialog mounts the root inside `DialogContent`, so reopening a closed dialog starts with an empty query.

### Show and hide

`ColumnChooserVisibility` is named `Show <column>` by default. `setColumnVisible` adds an unchecked column's key to `hidden` or removes a checked one's key. The hidden count includes state-hidden columns even when search excludes them; definition-hidden columns do not count.

`ColumnChooserResetAll` emits `EMPTY_COLUMN_STATE`: `{ order: [], widths: {}, hidden: [] }`. `isDefaultColumnState` checks that all three fields are empty. Resetting leaves the search query unchanged.

### Reorder

Drag an item onto another to take its place, shifting the items between them. Alt+Up/Down on an item or its controls moves it one place; move buttons provide the same operation. Each root owns its drag session and rejects drops from another chooser or external text.

`moveColumnTo` and `moveColumnBy` refuse moves across the frozen boundary. Moves use the full chooser order, including state-hidden columns and search-excluded rows, and write that order to the new state. A refused move emits no change. Presenting a different order does not change these grid-order neighbors.

Focus recovery runs when chooser or item state updates. Focus stays with a reordered item. If its focused action becomes disabled or hidden, focus moves to the item. If the focused item disappears, focus moves to the search field or root. Keep the item's focusability when customizing its markup. A custom control that hides through private state or external DOM changes owns its focus handoff.

### Widths

`ColumnChooserWidth` prints `columnState.widths[key] ?? column.width` in pixels using the numeric class. The chooser does not clamp that value; the grid renders at least `column.minWidth ?? 48` pixels.

`ColumnChooserResetWidth` calls `resetColumnWidth` to remove that key, restoring the definition's width subject to the grid's minimum. Resize in the grid by dragging the header handle or pressing Alt+Shift+Left/Right with a column focused; the chooser has no width field.

### Rules in words

Pass the column rules from [`grid-rules`](grid-rules.md) as `rules`. Map each item's rule readings into `ColumnChooserRule`. Use the index from the current item's rules array as `ruleIndex`, with unique collection keys when IDs repeat. Its text uses the trimmed, nonblank rule label or `describeRule`; its tooltip uses the description. State-hidden columns retain their rules. Badges show configured rules without editing or applying them; share the same rules with the grid to apply highlights.

### A dialog is a wall

With [`use-hotkeys`](use-hotkeys.md), focus inside a dialog reaches only scopes declared inside that dialog. Typing in its search box does not fire the grid's single-key bindings underneath. Compose the installed Dialog with a title, description, and DialogTrigger. The trigger owns return focus after dismissal. An inline root has no dialog boundary.

### Labels

`labels` supplies the root name, search box, `Show` prefix, frozen and hidden words, width label, width reset, and move names. The default root title is `Columns` and search is `Find a column`. Use `aria-label` or `aria-labelledby` to override a part's accessible name.

The retained description, reset-all text, empty message, and drag hint are available through the root hook for your composition. Action children and their placement belong to you. The width reading keeps the `px` suffix; any close-button text belongs to the installed Dialog.

### What it does not do

Column definitions, resizing, and persistence belong to the caller and grid. The chooser edits the supplied state and creates no feed subscription or timer. See [Migrating to v2](migrating-v1-to-v2.md#columnchooser) for previous call shapes.

### Tokens

The install adds the grid's `up`, `down`, `flat`, `stale`, and `expiring` tokens with their soft variants if missing. Rule badges use them; `primary` and `destructive` use the host theme's tokens.
