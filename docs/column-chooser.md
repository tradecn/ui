# ColumnChooser

Compose controls for one grid's column visibility, order, and widths.

## Usage

```tsx
import { useState, type ComponentProps, type ReactNode } from "react"
import { createInstrumentFormatter, formatNotional } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ColumnChooser, ColumnChooserAnnouncer, ColumnChooserFrozen, ColumnChooserHiddenCount, ColumnChooserItem, ColumnChooserMove, ColumnChooserName, ColumnChooserResetAll, ColumnChooserResetWidth, ColumnChooserRule, ColumnChooserSearch, ColumnChooserVisibility, ColumnChooserWidth, DEFAULT_COLUMN_CHOOSER_LABELS, useColumnChooser, type ColumnChooserProps } from "@/components/ui/column-chooser"
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

export function ColumnSettingsDialog<T>({ open, onOpenChange, className, contentProps, children, ...props }: Omit<ColumnChooserProps<T>, "children"> & { open: boolean; onOpenChange: (open: boolean) => void; contentProps?: Omit<ComponentProps<typeof DialogContent>, "children">; children: ReactNode }) {
  const labels = { ...DEFAULT_COLUMN_CHOOSER_LABELS, ...props.labels }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
      <DialogContent {...contentProps} className={contentProps?.className ?? `max-h-[calc(100%-2rem)] grid-cols-1 overflow-auto sm:max-w-lg ${className ?? ""}`}>
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
      <ColumnChooserAnnouncer />
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

The grid and chooser share one `ColumnState`. Save this example as `column-chooser.tsx` outside `components/ui` to reuse its exported `ColumnSettingsPanel`, `ColumnSettingsDialog`, and `ColumnSettings` compositions. The install includes the shadcn Dialog used here.

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
        ├── ColumnChooserAnnouncer (optional)
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

`ColumnChooserProps<T>` extends native `div` props. Default words come from `DEFAULT_COLUMN_CHOOSER_LABELS`. The root defaults to `role="group"` and `tabIndex={-1}`, named by `labels.title` for focus fallback. Native props, refs, classes, and events pass through the public parts.

| Prop | Type | Default | Description |
|---|---|---|---|
| `columns` | `ColumnDef<T>[]` | Required | Column definitions shared with the grid. |
| `columnState` | `ColumnState` | Required | Controlled order, width overrides, and hidden keys. |
| `onColumnStateChange` | `(state: ColumnState) => void` | Required | Accept edits into the state shared with the grid. |
| `baseState` | `ColumnState` | Empty state | Shared defaults for reset and default-state comparisons. |
| `presented` | `readonly string[]` | Search-result keys | Column keys in your collection's render order. |
| `children` | `ReactNode` | Required | Your controls, collection, and surrounding content. Conditional content is supported. |
| `rules` | `ColumnRule[]` | Omitted | Highlight rules shown beside their columns. |
| `labels` | `Partial<ColumnChooserLabels>` | Default labels | Words used by readings and controls. |
| `className` | `string` | Omitted | Additional classes to apply to the root. |

### Public parts

`ColumnChooserItem` renders a focusable, draggable `div` with `role="group"` and `tabIndex={0}`, named by its column. Place it inside your `li` or card. Keep collection keys tied to the column key. A missing or definition-hidden key renders nothing.

| Part | Inputs | Description |
|---|---|---|
| `ColumnChooserItem` | Required `columnKey: string`, `children: ReactNode`; native `div` props | Coordinates drag, keyboard reorder, and focus for one column. |
| `ColumnChooserSearch` | Installed Input props except `value` and `defaultValue` | Reads and writes the root's query. |
| `ColumnChooserAnnouncer` | Native `span` props except `children` | Announces accepted edits through a polite status region. Mount once per chooser. |
| `ColumnChooserHiddenCount` | Native `span` props except `children` | Prints the hidden count and its label. |
| `ColumnChooserVisibility` | Installed Checkbox props except `checked`, `defaultChecked`, and `indeterminate` | Reads and writes the item's visibility. |
| `ColumnChooserName` | Native `span` props except `children` | Prints the column name, with the full name as its title. |
| `ColumnChooserFrozen` | Installed Badge props except `children` | Prints the frozen label for frozen columns. |
| `ColumnChooserRule` | Required `ruleIndex: number`; installed Badge props except `children` | Prints the rule at this index in the item’s rule readings. Missing rules render nothing. |
| `ColumnChooserWidth` | Native `span` props except `children` | Prints the width in pixels with numeric typography. |
| `ColumnChooserResetWidth` | Required `children`; installed Button props | Restores the item's baseline width. Invisible, disabled, and outside the tab order when it already matches. |
| `ColumnChooserMove` | Required `direction: "up" \| "down"`, `children`; installed Button props | Moves within the column's frozen group. Disabled at its boundary. |
| `ColumnChooserResetAll` | Required `children`; installed Button props | Restores the default column state. Disabled when already at the default. |

Actions default to `type="button"`. Reset all uses `variant="outline"`; move and reset-width actions use `variant="ghost"`. Omitted or undefined `size` uses `sm` with compact classes. An explicit size, including `null`, passes through without those classes.

Search defaults to the name in `labels.search`; visibility uses `Show <column>`. Move and reset-width actions use `Move up: <column>`, `Move down: <column>`, and `Reset width: <column>` from the labels. These names replace the action's visible text.

Match custom visible text in the accessible name. Pass an `aria-label` containing it, such as `Earlier: Client`, or use `aria-labelledby`. Reset all takes its name from its children. Use a separate data attribute for application markers. The root and item reserve `data-slot` for event and focus ownership.

Search, click, keyboard, and drag handlers run before the corresponding chooser behavior. Call `event.preventDefault()` to cancel that behavior; cancel a drag move in `onDrop`, since preventing `dragover` is the browser's signal to accept a drop. A visibility callback receives the installed Checkbox's arguments; use the item hook for a replacement control. Supply an accessible name when replacing an interactive part.

### Hooks

`useColumnChooser()` returns `ColumnChooserState`: full `rows`, filtered `shown`, normalized `presented`, `query`, `setQuery`, `labels`, `hiddenCount`, `isDefault`, and `reset`. Each `ColumnChooserEntry` has `key`, `name`, `visible`, `frozen`, `width`, `resized`, and `rules`. `resized` compares the width with `baseState`; each rule reading contains its source `rule` and computed `description`.

`useColumnChooserItem()` returns `ColumnChooserItemState`: `row`, `canMoveUp`, `canMoveDown`, `dragging`, `setVisible(visible)`, `move(-1 | 1)`, and `resetWidth()`. Both hooks require their named owner. The item coordinates drag and focus even when you replace its controls.

### The grid's state is the only state

The chooser emits complete `ColumnState` snapshots without applying or persisting them itself. Accept each edit into the state shared with the grid. Initialize that state from your defaults and pass the same defaults as `baseState`; the chooser does not merge defaults into the grid's state. It keeps transient search, drag and announcement state. Replace changed objects and arrays: readings are memoized by their input references.

`chooserRows(columns, columnState, rules)` returns `ChooserRow<T>[]`: frozen columns first, then the rest, ordered by `columnState.order` within each group. Unlisted keys follow in definition order. State-hidden columns keep their places; definition-hidden columns are excluded. The helper retains the source column definition for headless consumers.

Search matches the column name or key by case-insensitive substring, ignoring surrounding query spaces. A nonblank string header supplies the name; otherwise the key does. Search filters the collection without changing column state. The ordinary dialog mounts the root inside `DialogContent`, so reopening a closed dialog starts with an empty query.

### Show and hide

`ColumnChooserVisibility` is named `Show <column>` by default. `setColumnVisible` adds an unchecked column's key to `hidden` or removes a checked one's key. The hidden count includes state-hidden columns even when search excludes them; definition-hidden columns do not count.

`ColumnChooserResetAll` restores `baseState`, defaulting to `EMPTY_COLUMN_STATE`: `{ order: [], widths: {}, hidden: [] }`. Resetting leaves the search query unchanged. The root's `isDefault` compares effective order, visibility and widths for all known columns, including definition-hidden ones whose settings may be used later. An incoming complete order is still default when its effective settings match the baseline.

Pass the same `baseState` to DataGrid so its header-menu **Reset columns** restores the same defaults. DataGrid emits that snapshot as supplied, including on repeated reset; the chooser normalizes its edits and skips effective no-ops.

An emitted edit removes retired keys and normalizes settings that match the baseline back to its representation. Definition-hidden settings remain known and are preserved. Loading state, changing defaults or issuing a no-op command emits nothing. The standalone `isDefaultColumnState` helper retains its raw check for three empty fields; use the root reading for baseline comparisons.

### Reorder

Drag an item onto another to take its place, shifting the items between them. Alt+Up/Down and move buttons use the next presented column on the same side of the frozen boundary. By default, those neighbors are the current search results, so moving a matching column changes the displayed order. Each root owns its drag session and rejects drops from another chooser or external text.

Moves take the target's place in the full order, including columns omitted from your collection. A move and its reverse can leave an intervening omitted column in a different position, even when the presented order looks restored. Reset uses the full baseline comparison.

Pass `presented` when your collection filters or rearranges `rows`. Keys follow render order; unknown and definition-hidden keys are ignored, and repeated keys use their first occurrence. Each frozen group finds neighbors within its presented sequence. An omitted item or a group with one item has no move neighbor. An explicit sequence is authoritative even while Search has a query; derive it again from accepted state, and render `useColumnChooser().presented` to keep markup and controls aligned. A fixed alphabetical sort cannot display manual reordering.

A visible-only collection can share the grid's controlled props:

```tsx
import { ColumnChooser, ColumnChooserAnnouncer, ColumnChooserItem, ColumnChooserMove, ColumnChooserName, chooserRows, useColumnChooser, type ColumnChooserProps } from "@/components/ui/column-chooser"

export function SelectedColumns<T>(props: Omit<ColumnChooserProps<T>, "children" | "presented">) {
  const presented = chooserRows(props.columns, props.columnState).filter((row) => row.visible).map((row) => row.key)
  return <ColumnChooser {...props} presented={presented}><SelectedColumnList /><ColumnChooserAnnouncer /></ColumnChooser>
}

function SelectedColumnList() {
  const { presented } = useColumnChooser()
  return <ul aria-label="Selected columns">{presented.map((row) => <li key={row.key}>
    <ColumnChooserItem columnKey={row.key}>
      <ColumnChooserName />
      <ColumnChooserMove direction="up">Move up</ColumnChooserMove>
      <ColumnChooserMove direction="down">Move down</ColumnChooserMove>
    </ColumnChooserItem>
  </li>)}</ul>
}
```

Moves preserve excluded columns in the complete known-column order. A refused move emits no change. The standalone `moveColumnTo` and `moveColumnBy` helpers retain their full-order semantics and refuse moves across the frozen boundary.

Mount `ColumnChooserAnnouncer` once to announce accepted show, hide, move, width-reset and reset-all edits. It is initially empty and stays silent for rejected edits, no-ops, searches and unrelated external updates. A later state matching an outstanding edit is treated as acceptance. Move positions count the committed presented collection. Announcement updates stay in this leaf; they do not trigger another collection render.

Focus recovery runs when chooser or item state updates. Focus stays with a reordered item. If its focused action becomes disabled, hidden, or inert, focus moves to the item. Controls that remain in the tab order while `aria-disabled` keep focus. If the focused item disappears, focus moves to the search field or root. Keep the item's focusability when customizing its markup. A custom control that hides through private state or external DOM changes owns its focus handoff.

### Widths

`ColumnChooserWidth` prints `columnState.widths[key] ?? column.width` in pixels using the numeric class. The chooser does not clamp that value; the grid renders at least `column.minWidth ?? 48` pixels.

`ColumnChooserResetWidth` restores `baseState.widths[key] ?? column.width`, subject to the grid's minimum. The standalone `resetColumnWidth` helper still removes the key to restore the definition's width. Resize in the grid by dragging the header handle or pressing Alt+Shift+Left/Right with a column focused; the chooser has no width field.

### Rules in words

Pass the column rules from [`grid-rules`](grid-rules.md) as `rules`. Map each item's rule readings into `ColumnChooserRule`. Use the index from the current item's rules array as `ruleIndex`, with unique collection keys when IDs repeat. Its text uses the trimmed, nonblank rule label or `describeRule`; its tooltip uses the description. State-hidden columns retain their rules. Badges show configured rules without editing or applying them; share the same rules with the grid to apply highlights.

### A dialog is a wall

With [`use-hotkeys`](use-hotkeys.md), focus inside a dialog reaches only scopes declared inside that dialog. Typing in its search box does not fire the grid's single-key bindings underneath. Compose the installed Dialog with a title and description. Use `DialogTrigger` when opening from a button; it owns return focus after dismissal. An inline root has no dialog boundary.

For a menu or hotkey opener, set an explicit return target through the shared recipe's `contentProps`: `onCloseAutoFocus` on Radix, or `finalFocus` on Base UI. See the complete [menu migration](migrating-v1-to-v2.md#columnchooser). These props use your installed `DialogContent` type, including refs and events. An explicit `contentProps.className` replaces the recipe's content classes; omitted or undefined preserves them. The recipe owns its content children.

In the shared recipes, `ColumnSettingsDialog.className` styles `DialogContent`; `ColumnSettingsPanel.className` styles the chooser root.

### Labels

`labels` supplies the root name, search box, `Show` prefix, frozen and hidden words, width label, width reset, and move names. The default root title is `Columns` and search is `Find a column`. Use `aria-label` or `aria-labelledby` to override a part's accessible name.

The retained description, reset-all text, empty message, and drag hint are available through the root hook for your composition. Action children and their placement belong to you. The width reading keeps the `px` suffix; any close-button text belongs to the installed Dialog.

Announcement templates are `announceMove`, `announceReorder`, `announceShow`, `announceHide`, `announceResetWidth` and `announceReset`. Use `{name}` for the column; `announceMove` also receives `{n}` and `{m}`, as in `{name} moved to {n} of {m}.` Missing or undefined templates retain their defaults.

### What it does not do

Column definitions, resizing, and persistence belong to the caller and grid. The chooser edits the supplied state and creates no feed subscription or timer. See [Migrating to v2](migrating-v1-to-v2.md#columnchooser) for previous call shapes.

### Tokens

The install adds the grid's `up`, `down`, `flat`, `stale`, and `expiring` tokens with their soft variants if missing. Rule badges use them; `primary` and `destructive` use the host theme's tokens.
