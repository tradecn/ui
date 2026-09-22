# AuditTrail

The life of one order or inquiry as events on a tape: when, the server's word for what happened, who, and what changed, with a pane beside it that shows one event's changes or the difference between two.

## Usage

```tsx
import { AuditTrail, type AuditEvent } from "@/components/ui/audit-trail"
import { createRowStore } from "@/lib/row-store"
```

```tsx
const trail = createRowStore<AuditEvent>({ getRowId: (e) => e.id, lane: "ordered" })

<AuditTrail
  store={trail}
  value={(field, value) => (field === "price" ? ust.price(value as number) : formatAuditValue(value))}
  onExport={(csv) => download(`order-${orderId}.csv`, csv)}
/>
```

## API Reference

It is the data grid in its `tape` preset (22 px rows, new rows highlighted, the viewport following the tail until a hand touches it, the row count announced) with multi-select, an event's columns, and a pane beside it. Every `DataGrid` prop passes through except `preset`. Sorting, column state, and the keyboard are [`data-grid`](data-grid.md)'s. If you already installed `data-grid`, the shared files are byte-identical and nothing of yours changes.

### An event is the server's word

An `AuditEvent` is `{ id, at, event, by?, message?, changes? }`: when it happened, the server's word for what happened, printed as it is (`New`, `Acknowledged`, `PartiallyFilled`, `Amended`, `Cancelled`, whatever the venue says), who did it, a line of the server's, and the fields it changed as `{ field, from, to }`. Nothing here decides what an event means or orders events for itself: the store's order is the trail's order, the ordered lane's if your feed numbers them, and `sort` is yours to pass. Values are the server's too, printed through `value(field, value, event)`, or `formatAuditValue` when you pass none: text as text, nothing as the null token.

### The tape

Events land at the tail and the grid follows them there until a key or a pointer touches it, then counts the arrivals on a pill, as every `tape` does. Rows never flash: an event does not change, it arrives. The changes column counts the fields an event touched, and an event that touched none prints the null token.

### The pane

Rows have one height, so an event's changes are not in the row. Select one and the pane beside the grid lists them as a two-column table, the field and its value before against its value after. Select two, with Shift, Ctrl or Cmd, or the checkbox column if you turn it on, and the pane shows the difference between those two moments: every field whose value after the later event differs from its value after the earlier one, whichever you selected first. The state at an event is the fold of every change up to and including it, `foldChanges(events, id)`, and `diffEvents(events, a, b)` is the difference, both exported for a test or a view of your own. The pane redraws when the store changes, so a correction the server sends for a selected event shows at once. `pane={false}` leaves the grid alone for a layout of your own.

### Export

Pass `onExport` and a button appears; pressing it hands you the CSV of the events shown, in the grid's columns and through their formatters, from `exportCsv`. Where it goes, a download, the clipboard, a ticket, is yours. Without `onExport` there is no button.

### Columns

`auditTrailColumns({ time, labels })` returns time, event, by, message, and changes. It is a plain list: spread it into your own to add a column, drop one, or reorder. `time` defaults to local `HH:MM:SS.mmm`. Keep `columns`, `time`, and `value` stable, a module constant or a `useMemo`.

### Labels

Every word is in `labels`, a partial of `DEFAULT_AUDIT_TRAIL_LABELS`: the column headers, the pane's three headings, the export button, the line with nothing selected, the line for an event that changed nothing, the two titles, and the line for two events with nothing between them.

### What it does not do

Fetch, decide, or reorder. It does not know what an order is: a trail is whatever events you put in the store, for an order, an inquiry, a parameter row, or a session.
