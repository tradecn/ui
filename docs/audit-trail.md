# AuditTrail

An event tape for an order, inquiry, or other record, with a pane for one event's changes or the difference between selected events.

## Usage

```tsx
import { useState } from "react"
import { createInstrumentFormatter } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"
import { AuditTrail, formatAuditValue, type AuditEvent } from "@/components/ui/audit-trail"

const T32 = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const value = (field: string, v: unknown) => (field === "price" && typeof v === "number" ? T32.price(v) : formatAuditValue(v))

const events: Omit<AuditEvent, "at">[] = [
  { id: "e1", event: "New", by: "trader", message: "Buy 5,000 ZN limit", changes: [{ field: "side", to: "buy" }, { field: "quantity", to: 5000 }, { field: "price", to: 99.515625 }, { field: "status", to: "New" }] },
  { id: "e2", event: "Acknowledged", by: "venue", message: "Order id 8817", changes: [{ field: "status", from: "New", to: "Working" }] },
  { id: "e3", event: "PartiallyFilled", by: "venue", changes: [{ field: "filled", from: 0, to: 2000 }, { field: "status", from: "Working", to: "PartiallyFilled" }] },
  { id: "e4", event: "Amended", by: "trader", message: "Price to 99-17", changes: [{ field: "price", from: 99.515625, to: 99.53125 }] },
  { id: "e5", event: "Acknowledged", by: "venue", message: "Amend accepted" },
  { id: "e6", event: "PartiallyFilled", by: "venue", changes: [{ field: "filled", from: 2000, to: 3500 }] },
  { id: "e7", event: "Filled", by: "venue", changes: [{ field: "filled", from: 3500, to: 5000 }, { field: "status", from: "PartiallyFilled", to: "Filled" }] },
]

const start = Date.UTC(2026, 8, 23, 14, 30)
const time = (ms: number) => new Date(ms).toISOString().slice(11, 23)

function OrderHistory() {
  const [store] = useState(() => {
    const store = createRowStore<AuditEvent>({ getRowId: (event) => event.id, lane: "ordered" })
    store.applyDeltas({ upsert: events.map((event, index) => ({ ...event, at: start + index * 1500 })) })
    return store
  })
  const [csv, setCsv] = useState("")
  return (
    <div className="w-5xl max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <p className="text-muted-foreground">Sample order history · 23 September 2026 · UTC</p>
      <div role="region" aria-label="Order history and changes" tabIndex={0} className="overflow-x-auto">
        <div className="h-72 min-w-[44rem]">
          <AuditTrail store={store} time={time} value={value} selectionColumn onExport={setCsv} label="Order events" />
        </div>
      </div>
      {csv && <pre role="region" aria-label="Exported CSV" tabIndex={0} className="max-h-36 overflow-auto rounded border border-border p-2 font-(family-name:--tradecn-font-mono)">{csv}</pre>}
    </div>
  )
}
```

This fixed sample history is ready to inspect on load. Select an event for its changes, or use the checkboxes to compare two events. The full ordered history stays in the store, so comparisons include intervening changes. Times are UTC; the supplied value formatter prints price changes in 32nds.

Export CSV displays the text passed to `onExport`; the callback does not download a file. On a narrow screen, scroll the history container to reach the changes pane, and scroll the grid to reach its remaining columns.

## API Reference

`AuditTrail` uses [`data-grid`](data-grid.md)'s `tape` preset with multi-selection, event columns, and a changes pane. Shared files are byte-identical to the ones installed by `data-grid`.

### Props

`AuditTrailProps<T>` accepts rows extending `AuditEvent`.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Events keyed by their `id`. |
| `view` | `RowView<T>` | None | Supplies the row IDs and order for the grid, pane comparisons, and export. |
| `columns` | `ColumnDef<T>[]` | `auditTrailColumns({ time, labels })` | Replace or extend the event columns. |
| `time` | `(ms: number) => string` | Local `HH:MM:SS.mmm` | Format default time cells and pane titles. |
| `value` | `(field: string, value: unknown, event: T) => string` | `formatAuditValue(value)` | Format the pane's before and after values. |
| `pane` | `boolean` | `true` | Show the changes pane. |
| `onExport` | `(csv: string) => void` | None | Show an export button and receive its CSV. |
| `label` | `string` | `"Audit trail"` | Accessible name for the grid. |
| `labels` | `Partial<AuditTrailLabels>` | `DEFAULT_AUDIT_TRAIL_LABELS` | Override column, pane, and export text. |
| `selection` | `ReadonlySet<RowId>` | Internal empty set | Control the selected events. |
| `onSelectionChange` | `(selection: ReadonlySet<RowId>) => void` | None | Receive selection changes; update `selection` when controlled. |
| `selectionColumn` | `boolean` | `false` | Show selection checkboxes. |
| `renderContextMenu` | `(rows: T[], ids: RowId[]) => ReactNode` | None | Add right-click menu items for the selection or the row under the pointer. |
| `className` | `string` | None | Style the outer container, including the pane and export button. |

Other grid inputs, including sorting, filtering, column state, row height, and row callbacks, follow [`DataGridProps`](data-grid.md). `preset` is excluded. Although the type inherits `selectionMode`, the component always sets it to `"multi"`. See the pane and export sections for their view and column-state limits.

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

Without a supplied view or grid sorting/filtering, rows follow the store's order, not the `at` timestamps. Use the ordered lane for a sequenced feed. Default columns disable value flashes, including when an event is corrected. The changes column shows the number of changes, or the null token when there are none.

### The pane

Changes appear beside the grid so event rows keep one height. Use Shift, Ctrl or Cmd, or the optional checkbox column to select several events.

| Selection | Pane contents |
|---|---|
| None | The selection prompt. |
| One event | Its changes as Field, From, and To, or the no-changes message. |
| Two or more events | The cumulative difference between the first and last selected events in the pane's row order, regardless of selection order. |

The pane reads IDs from `view` when supplied, otherwise from `store`. Grid-only sorting, filtering, and filter/sort rules do not change that list. Keep selected IDs within the supplied view. A chronological comparison needs a chronologically ordered list containing the preceding changes; filtering that list can remove history needed to reconstruct a value.

`foldChanges(events, id)` applies each change's `to` value through the named event and returns a `Map<string, unknown>`. It does not infer earlier state from `from`. `diffEvents(events, a, b)` compares those maps with `Object.is`, returning `AuditChange[]`; it returns an empty array if either ID is absent. Both helpers use array order, not timestamps.

`value(field, value, event)` receives the selected event for a single-event pane. For a comparison, both sides receive the last selected event in the pane's order. The pane updates on store batches, including corrections to selected events. Set `pane={false}` to hide it.

### Export

The export button calls `onExport(csv)`. Downloading, copying, or sending that text is yours; without the callback there is no button.

CSV comes from `exportCsv(store, columns, ids)` using these inputs:

| Input | Export behavior |
|---|---|
| Rows | All IDs in the supplied `view`, or the raw store when no view is supplied. Grid-only sorts, filters, and rules do not alter the export. |
| Columns | The supplied or default column definitions, in their array order, excluding definitions with `hidden: true`. `columnState` hiding and reordering do not apply. |
| Values | Column accessors and `format` callbacks. Cell renderers and the pane's `value` formatter do not apply. Without a column formatter, null and undefined become empty CSV cells. |

### Columns

`auditTrailColumns({ time, labels })` returns columns keyed `at`, `event`, `by`, `message`, and `changes`. Spread the list to add, remove, or reorder columns. Its options also accept `value` so one options object can serve the columns and pane, but the columns do not use it. Keep `columns`, `time`, and `value` stable with module constants or memoization.

### Labels

`labels` overrides the default column headers, Field/From/To headings, export button, selection prompt, empty-change messages, and pane titles. `fields` uses `{n}`; `eventTitle` uses `{event}` and `{time}`; `diffTitle` uses `{a}` and `{b}` for the event names with their formatted times. The grid's accessible name is the separate `label` prop.

### What it does not do

It does not fetch events, assign their meaning, or infer a chronological order. The store can describe an order, an inquiry, a parameter row, or a session.
