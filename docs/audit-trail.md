# AuditTrail

Displays event history, selected changes, comparisons, and export controls.

## Usage

```tsx
import { useState } from "react"
import { NUMERIC_CLASS } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"
import { AuditTrail, AuditTrailChanges, AuditTrailGrid, type AuditEvent } from "@/components/ui/audit-trail"

const TIME = Date.UTC(2026, 8, 23, 14, 30)
const time = (ms: number) => new Date(ms).toISOString().slice(11, 23)

export function AuditChangesTable() {
  return <AuditTrailChanges>{({ title, changes, emptyMessage, formatValue, labels }) => <>
    {title && <h3 className="font-medium">{title}</h3>}
    {changes.length === 0 ? <p className="text-muted-foreground">{emptyMessage}</p> : (
      <table aria-label={labels.changes} className="w-full border-separate border-spacing-x-2 text-left">
        <thead><tr className="text-muted-foreground">
          <th scope="col" className="font-normal">{labels.field}</th>
          <th scope="col" className="font-normal">{labels.from}</th>
          <th scope="col" className="font-normal">{labels.to}</th>
        </tr></thead>
        <tbody>{changes.map((change, index) => <tr key={index} data-audit-change={change.field}>
          <th scope="row" className="font-medium">{change.field}</th>
          <td data-audit-from="" className={`${NUMERIC_CLASS} text-muted-foreground line-through decoration-muted-foreground/60`}>{formatValue(change.field, change.from)}</td>
          <td data-audit-to="" className={NUMERIC_CLASS}>{formatValue(change.field, change.to)}</td>
        </tr>)}</tbody>
      </table>
    )}
  </>}</AuditTrailChanges>
}

export default function AuditTrailDemo() {
  const [store] = useState(() => {
    const rows = createRowStore<AuditEvent>({ getRowId: row => row.id, lane: "ordered" })
    rows.applyDeltas({ upsert: [
      { id: "e1", at: TIME, event: "New", changes: [{ field: "quantity", to: 5000 }, { field: "status", to: "New" }] },
      { id: "e2", at: TIME + 1000, event: "Acknowledged", changes: [{ field: "status", from: "New", to: "Working" }] },
    ] })
    return rows
  })

  return <AuditTrail store={store} time={time} className="h-auto w-3xl max-w-full">
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="h-40 min-w-0"><AuditTrailGrid /></div>
      <AuditChangesTable />
    </div>
  </AuditTrail>
}
```

Select an event to show its changes. Use Ctrl or Cmd to select another event and compare the two. This example uses fixed UTC timestamps.

Save this complete example as `audit-trail.tsx` outside `components/ui` to reuse `AuditChangesTable` in the examples below.

## Composition

Use the following composition to build an `AuditTrail`:

```text
AuditTrail
├── AuditTrailExportButton
├── AuditTrailGrid
└── AuditTrailChanges
    └── Your title, empty state and change markup
```

The grid, changes section and export control are optional. Arrange them with your own headers, footers and containers.

## History and Export

Use `AuditTrailExportButton` to send CSV to your application. Save this example as `audit-trail-history.tsx` beside `audit-trail.tsx` from Usage.

Times are UTC and prices use 32nds. Export displays the CSV below the history. On narrow screens, the changes table moves below the grid.

<!-- demo: audit-trail-history -->

## Custom Layout

Use `useAuditTrailChanges()` inside `AuditTrailChanges` to read the same comparison in a card layout. Save both prerequisite files from Usage and History and Export beside this example.

<!-- demo: audit-trail-layout -->

## API Reference

`AuditTrail` coordinates its public parts. Shared files are byte-identical to the ones installed by [`data-grid`](data-grid.md).

### Props

`AuditTrailProps<T>` accepts rows extending `AuditEvent` and native `div` props, including refs and events. It does not subscribe to store updates.

Columns default to `auditTrailColumns({ time, labels })`, and labels default to `DEFAULT_AUDIT_TRAIL_LABELS`.

The value formatter has the signature `(field: string, value: unknown, event: T) => string`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Events keyed by their `id`. |
| `children` | `ReactNode` | Required | Your composition. |
| `view` | `RowView<T>` | - | Shared row IDs and order for the grid, comparisons and export. The caller owns its disposal. |
| `columns` | `ColumnDef<T>[]` | Event columns | Shared event columns for the grid and export. |
| `time` | `(ms: number) => string` | Local `HH:MM:SS.mmm` | Format default time cells, event titles and comparison titles. |
| `value` | `(field, value, event) => string` | `formatAuditValue` | Format before and after values. |
| `labels` | `Partial<AuditTrailLabels>` | Default labels | Override column, changes and export text. |
| `selection` | `ReadonlySet<RowId>` | Internal empty set | Control the selected events. |
| `onSelectionChange` | `(selection: ReadonlySet<RowId>) => void` | - | Receive selection changes; update `selection` when controlled. |
| `className` | `string` | - | Additional classes to apply to the container. |

### AuditTrailGrid

Renders [`DataGrid`](data-grid.md) with the `tape` preset and multi-selection. Give its container a height. `className` and `ref` apply to its sizing wrapper.

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | `"Audit trail"` | Accessible name for the grid. |
| `selectionColumn` | `boolean` | `false` | Show selection checkboxes. |
| `renderContextMenu` | `(rows: T[], ids: RowId[]) => ReactNode` | - | Menu items for the selection or the row under the pointer. |
| `className` | `string` | - | Additional classes to apply to the grid wrapper. |

Sorting, filtering, column state, row height, focus, keyboard navigation and row callbacks follow [`DataGridProps`](data-grid.md). Store, view, columns and selection come from the root. The preset and selection mode are fixed. For extended event rows, use the same row type on `<AuditTrail<T>>` and `<AuditTrailGrid<T>>` when supplying row callbacks.

### AuditTrailChanges

Renders a named `section` and shares one live reading with its children. Native props, refs, events and `className` are forwarded. Its accessible name defaults to `labels.changes`; set `aria-label` or `aria-labelledby` to name another presentation.

| Prop | Type | Default |
|---|---|---|
| `children` | `ReactNode \| ((state: AuditTrailChangesState) => ReactNode)` | Required |
| `className` | `string` | - |

A render callback receives the following state. Descendant components can also read it with `useAuditTrailChanges()` without adding subscriptions.

| Reading | Type | Description |
|---|---|---|
| `kind` | `"none" \| "event" \| "diff"` | The current selection reading. |
| `event` | `AuditEvent \| null` | Selected event, or the last event in a comparison. |
| `title` | `string` | Formatted event or comparison title; empty without selection. |
| `changes` | `readonly AuditChange[]` | Event changes or calculated differences. Render, filter or reorder them in your own markup. |
| `emptyMessage` | `string` | Selection prompt, no-changes message or unchanged-comparison message; empty when there are changes. |
| `labels` | `AuditTrailLabels` | Resolved labels. |
| `formatValue` | `(field: string, value: unknown) => string` | Applies the root formatter with the selected or latter event; uses `formatAuditValue` without an event. |

Place repeated readings inside one scope to share its calculation. Each mounted `AuditTrailChanges` owns its subscriptions and releases them on unmount or source replacement. The root, export controls and hooks add no store subscriptions.

The section carries `data-slot="tradecn-audit-trail-changes"` and its own lining, tabular figures, including when rendered through a portal.

### AuditTrailExportButton

Calls the required `onExport(csv)` callback with the current history. Inherits props, refs and composition support from your installed Button. It defaults to `type="button"`, `variant="outline"`, small sizing and `labels.export` as its text. Children replace that text; supply an accessible name when using an icon.

`disabled` or a prevented `onClick` stops the export. `useAuditTrail().exportCsv()` returns the same CSV for custom controls, alongside `selection`, `select(next)` and `labels`.

### Accessibility

`AuditTrailGrid` supplies grid navigation and selection semantics. Use Shift, Ctrl or Cmd, or the optional checkbox column to select several events. The changes section is a named region; its headings and collection semantics belong to your composition.

`AuditChangesTable` uses a native table with column headers for Field, From and To and row headers for each field. Keep those header associations when adapting the table. Card layouts can use lists and definition lists, as shown in Custom Layout. Before values retain a strikethrough so the distinction does not depend on color.

### An event is the server's word

Event names and values come from the server. Names such as `New`, `Acknowledged`, `PartiallyFilled`, `Amended`, and `Cancelled` print as supplied; the component does not infer a status.

| `AuditEvent` field | Type | Meaning |
|---|---|---|
| `id` | `string` | Stable event ID; use it as the store's row key. |
| `at` | `number` | Time in milliseconds since the Unix epoch. |
| `event` | `string` | The server's event name. |
| `by` | `string \| null`, optional | User, venue, or system that produced the event. |
| `message` | `string \| null`, optional | The server's description. |
| `changes` | `readonly AuditChange[]`, optional | Fields changed by this event. |

Each `AuditChange` has a required `field: string` and optional `from` and `to` values of type `unknown`. The default pane formatter uses the null token for `null`, `undefined`, and empty text, JSON for objects, and `String(value)` otherwise.

### The tape

The tape defaults to 22 px rows, arrival highlights, and debounced row-count announcements. It follows the tail until keyboard or pointer interaction, or scrolling away, pauses it. While paused, a pill shows any net increase in displayed row count; pressing it or scrolling back to the end resumes following.

Arrow keys move focus. Home and End jump to the first and last rows; PageUp and PageDown move by a page.

Space toggles the focused row's selection. Hold Shift with Up/Down, Home/End or PageUp/PageDown to add a range to the selection. Ctrl/Cmd+A selects all rows in the grid's current view, and Escape clears selection.

Without a supplied view or grid sorting/filtering, rows follow the store's order, not the `at` timestamps. Use the ordered lane for a sequenced feed. Default columns disable value flashes, including when an event is corrected. The changes column shows the number of changes, or the null token when there are none.

### The pane

`AuditTrailChanges` can sit beside or below the grid, or in another part of your composition. Event rows keep one height.

| Selection | Pane contents |
|---|---|
| None | The selection prompt. |
| One event | Its changes as Field, From, and To, or the no-changes message. |
| Two or more events | The cumulative difference between the first and last selected events in the pane's row order, regardless of selection order. |

The pane reads IDs from `view` when supplied, otherwise from `store`. Grid-only sorting, filtering, and filter/sort rules do not change that list. Keep selected IDs within the supplied view. A chronological comparison needs a chronologically ordered list containing the preceding changes; filtering that list can remove history needed to reconstruct a value.

`foldChanges(events, id)` applies each change's `to` value through the named event and returns a `Map<string, unknown>`. It does not infer earlier state from `from`. `diffEvents(events, a, b)` compares those maps with `Object.is`, returning `AuditChange[]`; it returns an empty array if either ID is absent. Both helpers use array order, not timestamps.

`value(field, value, event)` receives the selected event for a single-event pane. For a comparison, both sides receive the last selected event in the pane's order. The reading updates on store batches, including corrections to selected events or preceding history. Missing store rows are ignored. Omit `AuditTrailChanges` to hide it.

### Export

Compose `AuditTrailExportButton` where you need it. Downloading, copying, or sending its CSV is yours; omit the control when export is unavailable.

CSV comes from `exportCsv(store, columns, ids)` using these inputs. Text that a spreadsheet would run as a formula — a leading `=`, `@`, tab, carriage return, or a sign not starting a number — is prefixed with an apostrophe, the spreadsheet convention for literal text; signed numbers export unprefixed.

| Input | Export behavior |
|---|---|
| Rows | All IDs in the supplied `view`, or the raw store when no view is supplied. Grid-only sorts, filters, and rules do not alter the export. |
| Columns | The supplied or default column definitions, in their array order, excluding definitions with `hidden: true`. `columnState` hiding and reordering do not apply. |
| Values | Column accessors and `format` callbacks. Cell renderers and the pane's `value` formatter do not apply. Without a column formatter, null and undefined become empty CSV cells. |

### Columns

`auditTrailColumns({ time, labels })` returns columns keyed `at`, `event`, `by`, `message`, and `changes`. Spread the list to add, remove, or reorder columns. Its options also accept `value` so one options object can serve the columns and pane, but the columns do not use it. Keep `columns`, `time`, and `value` stable with module constants or memoization.

### Labels

`labels` overrides the default column headers, Field/From/To headings, export button, selection prompt, empty-change messages, and pane titles. `fields` uses `{n}` and defaults to `Fields: {n}`, neutral wording a single template can keep grammatical at any count; `eventTitle` uses `{event}` and `{time}`; `diffTitle` uses `{a}` and `{b}` for the event names with their formatted times. The grid's accessible name is the separate `AuditTrailGrid.label` prop.

### What it does not do

It does not fetch events, assign their meaning, or infer a chronological order. The store can describe an order, an inquiry, a parameter row, or a session.
