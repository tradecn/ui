# AuditTrail

An event tape for an order, inquiry, or other record, with a pane for one event's changes or the difference between selected events.

## Usage

```tsx
import { AuditTrail, formatAuditValue, type AuditEvent } from "@/components/ui/audit-trail"
import { createRowStore } from "@/lib/row-store"
```

```tsx
const trail = createRowStore<AuditEvent>({ getRowId: (e) => e.id, lane: "ordered" })
const value = (field: string, value: unknown) =>
  field === "price" && typeof value === "number" ? ust.price(value) : formatAuditValue(value)

<AuditTrail
  store={trail}
  value={value}
  onExport={(csv) => download(`order-${orderId}.csv`, csv)}
/>
```

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
