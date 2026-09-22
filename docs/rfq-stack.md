# rfq-stack

The stack of open inquiries: the data grid in its RFQ preset, with an inquiry's columns, a countdown in every row, a threshold that hides the small auto-quoted ones, and a mark on the one in the ticket.

## Usage

```tsx
import { RfqStack, bySize, byTimeLeft, stackOrder, useRfqStackView, type RfqStackRow } from "@/components/ui/rfq-stack"
import { useActiveInquiry } from "@/hooks/use-active-inquiry"
import { createRowStore } from "@/lib/row-store"
```

```tsx
const ORDER = stackOrder<RfqStackRow>(bySize, byTimeLeft)

const [threshold, setThreshold] = useState<number | null>(5_000_000)
const view = useRfqStackView(store, { comparator: ORDER, threshold })
const active = useActiveInquiry(view, { isEnded: (row) => row.status !== "Open" && row.status !== "Quoted" })

<RfqStack store={store} view={view} activeId={active.activeId} onActivate={active.setActive} threshold={threshold} onThresholdChange={setThreshold} price={(v, row) => conventions[row.instrument].price(v)} />
```

## API Reference

It is the data grid in its `rfq` preset (26 px rows, single select, ring flash, a one-second reorder hold, new rows highlighted and the viewport pinned when they arrive above you) with a set of columns and three things an inquiry stack needs. Every `DataGrid` prop passes through except `preset`. Sorting, the hold, column state, and the keyboard are [`data-grid`](data-grid.md)'s. If you already installed `data-grid`, `countdown`, `blotter`, or `watchlist`, the shared files are byte-identical and nothing of yours changes.

### The columns

`rfqStackColumns({ price, time })` returns time, client (with the tier beside it), instrument, side, size, bid, ask, status, time left, and an auto mark. It is a plain list: spread it into your own to add a column, drop one, or reorder. `price` gets the row, because instruments print differently. The size prints as millions of notional, or as a count when the row's `quantityUnit` is `contracts`. The side is the client's, as a word. The status is the server's word and flashes flat when it changes. The time left is a compact [`countdown`](countdown.md) per row on one shared clock; its column sorts by the moment the inquiry ends, which never moves, so a stack sorted by time left never needs a clock to stay sorted. Rows are virtualized, so a thousand open inquiries are one screenful of countdowns.

### The order is yours

A desk sorts its stack by size, by client, by what is about to expire, or by a rule of its own. Pass `sort` for one column, or a `view` whose comparator is the rule. `useRfqStackView(store, { comparator, threshold, filter })` builds that view with the threshold and your filter folded in, and is what to hand both the stack and `useActiveInquiry`, so the ticket's next inquiry is one that is on the screen; it is remade when an option changes and the one before is disposed. `byTimeLeft`, `bySize`, and `byArrival` are ready comparators and `stackOrder(a, b, c)` chains them: the first that tells two inquiries apart decides. Keep a comparator's identity stable, a module constant, or the view is remade every render. The grid holds the order still for `reorderHoldMs` after any key or pointer, so nothing moves under a hand, and settles when the hand is gone. Without `sort` or `view` the stack is in arrival order.

### The threshold

An auto-quoter answers most inquiries and a trader wants to see only the ones worth a look. `threshold` hides auto-quoted rows (`auto: true`) under that size; a row a person has to answer always shows. Controlled with `onThresholdChange`, or uncontrolled from `defaultThreshold`; the field above the grid reads millions of notional (`thresholdUnit="contracts"` reads a count) and is shown whenever a threshold prop is given. Without a `view` the grid's own view applies it, with your `filter`. With a `view` of yours the grid shows exactly that view, so build it with `useRfqStackView` and pass the same `threshold` to both; the field then only reports. `rfqThresholdFilter(minQuantity)` is the rule as a function. Where the threshold is kept, per trader, is yours: a panel's state, for one.

### The active inquiry

`useActiveInquiry(source, { isEnded, onChange })` is the rule a stack and a ticket agree on. The active inquiry stays active until the trader acts on it or the server says it is over, and only then does the next open inquiry in the stack's order take its place. An inquiry arriving never changes it, wherever it lands in the order. `isEnded` reads the server's word on a row (expired, done, done away, passed: whatever the venue says), so the hook never decides an inquiry is over by itself. `setActive(id)` is the trader picking one; `next()` is the trader done with one, moving to the next open inquiry before the server has spoken. `activeId` is null when nothing on the stack is open.

Pass `activeId` to the stack and its row wears the mark (`data-state="active"`, a bar on the left). `onActivate` fires on Enter or a double click, the moment a trader asks for a row in the ticket. Mount the ticket with `key={active.activeId}` and the two agree.

### Arrival never moves anything

A new inquiry never moves the viewport (the preset pins it, so rows arriving above shift the scroll by exactly their height), never moves focus (focus is a row id), never moves the active mark, and never moves the order while a hand is on the grid. That is the stack's whole promise, and every part of it is held by identity, not by position.

### What it does not do

Fetch, sort by a rule it invents, decide that an inquiry is over, or keep the threshold anywhere. It has no actions of its own: a quote, a pass, a stop belong to the ticket, where the levels are.
