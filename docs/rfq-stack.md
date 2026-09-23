# RfqStack

`RfqStack` displays inquiries with market prices, time left, and a mark on the inquiry in the ticket. It adds inquiry columns and an optional auto-quote threshold to the data grid's `rfq` preset.

## Usage

Share one view between the stack and `useActiveInquiry` so automatic selection follows the displayed order and filters.

```tsx
import { useState } from "react"
import { useActiveInquiry } from "@/hooks/use-active-inquiry"
import { createRowStore } from "@/lib/row-store"
import { RfqStack, bySize, byTimeLeft, stackOrder, useRfqStackView, type RfqStackRow } from "@/components/ui/rfq-stack"

const order = stackOrder<RfqStackRow>(bySize, byTimeLeft)

function InquiryStack() {
  const [store] = useState(() => {
    const store = createRowStore<RfqStackRow>({ getRowId: (row) => row.id, lane: "ordered" })
    const now = Date.now()
    store.applyDeltas({ upsert: [
      { id: "Q-1", receivedAt: now, expiresAt: now + 60_000, client: "ALPHA", tier: "Tier 1", instrument: "ACME 4.5 2030", side: "buy", quantity: 10_000_000, bid: 99.5, ask: 99.55, status: "Open" },
      { id: "Q-2", receivedAt: now, expiresAt: now + 45_000, client: "BETA", instrument: "ACME 4.5 2030", side: "sell", quantity: 5_000_000, bid: 99.5, ask: 99.55, status: "Quoted", auto: true },
      { id: "Q-3", receivedAt: now, expiresAt: now + 30_000, client: "GAMMA", instrument: "ACME 4.5 2030", side: "two-way", quantity: 5_000_000, bid: 99.5, ask: 99.55, status: "Open" },
    ] })
    return store
  })
  const view = useRfqStackView(store, { comparator: order })
  const active = useActiveInquiry(view, { isEnded: (row) => row.status !== "Open" && row.status !== "Quoted" })
  return (
    <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <div className="h-40">
        <RfqStack store={store} view={view} activeId={active.activeId} onActivate={active.setActive} label="Client inquiries" />
      </div>
      <p className="text-muted-foreground">Active inquiry: {active.activeId ?? "None"}</p>
    </div>
  )
}
```

The store starts with three inquiries, ordered by size and then earliest expiry. Use your venue's statuses in `isEnded`. Focus the grid and use the arrow keys, then Enter, or double-click a row to activate it. The caption shows the active id; your app can use `active.row` to populate a ticket.

Give the stack a parent with a fixed height. The preview's alignment buttons apply across examples and remember your choice; left alignment keeps the edge still while you resize columns. These sample inquiries stay open or quoted when their countdown reaches zero. Your feed supplies the status that ends them.

## Auto-quote threshold

The threshold hides small auto-quoted inquiries. At `5` mm, ALPHA's 5mm auto quote passes, BETA's 2mm auto quote is hidden, and GAMMA's 1mm manual inquiry stays visible. Clear the field to show all three. With a shared view, pass the controlled threshold to both the view hook and the stack.

Raise the field to `6` to hide ALPHA too. Its Q-1 inquiry remains active: filtering changes what is displayed, not which inquiry is in the ticket. Activate another row to change that choice.

<!-- demo: rfq-stack-threshold -->

## Parking an inquiry

Park an inquiry to skip it during automatic selection without removing it from the stack. Right-click a row, or focus it with the arrow keys and press Shift+F10, to open its menu. Parking the active inquiry advances to the next eligible row; the caption lists parked ids, and parked rows carry an accessible description.

Unparking makes a row eligible again without replacing the current active inquiry. Activating a parked row with Enter or a double-click also unparks it. Parking is local state and sends nothing to the venue.

<!-- demo: rfq-stack-parking -->

## Feed updates

Step through three feed messages: a larger Q-3 inquiry arrives with a market-price update for Q-1, the venue marks Q-1 expired, then Q-1 is removed. Q-1 stays active through the arrival; the venue's expiry advances to the next eligible inquiry in displayed order unless you have already chosen another inquiry. Prices use Treasury fractions through the installed formatter.

The 15-second countdowns stop at zero without changing venue status. Let them run out to inspect that state, then receive the expiry message. Each button applies one store delta; there is no background publisher. Restart restores the two original inquiries and their timers. Reordering still follows the [hold rules below](#arrival-never-moves-anything).

<!-- demo: rfq-stack-updates -->

## API Reference

`T` extends `RfqStackRow`. The stack fixes `preset="rfq"`: 26 px rows, single selection, ring flashes for numeric cells, a 1000 ms reorder hold, arrival highlighting, and viewport pinning. Other [`data-grid`](data-grid.md) props remain available, including overrides for row height, selection, arrival behavior, and the hold. Column state and keyboard behavior belong to the grid.

`data-grid`, `countdown`, `blotter`, and `watchlist` share the same source files with this item at a given registry version. Locally edited or older installed files may differ.

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Inquiry data. |
| `view` | `RowView<T>` | Grid creates a view | Supplies the displayed order and filters. |
| `columns` | `ColumnDef<T>[]` | `rfqStackColumns()` | Replace, add, remove, or reorder columns. |
| `label` | `string` | `"Inquiries"` | Accessible grid name. |
| `activeId` | `RowId \| null` | `null` | Marks the inquiry in the ticket. |
| `parkedIds` | `ReadonlySet<RowId>` | None | Mutes parked rows. |
| `onActivate` | `(id: RowId, row: T) => void` | None | Requests a row for the ticket. |
| `renderContextMenu` | `(rows: T[], ids: RowId[]) => ReactNode` | None | Supplies right-click actions. |
| `className` | `string` | None | Styles the stack wrapper. |

Column-formatting and threshold props are listed below. Remaining props use `DataGridProps<T>`, except `preset`. `onRowActivate(row, id)` also runs after `onActivate(id, row)`; note the reversed arguments. Enter or a row double-click activates a row unless grid editing handles that interaction.

### The columns

`rfqStackColumns(options?)` returns time, client with tier, instrument, side, size, bid, ask, status, time left, and auto, in that order. Spread or filter this list to customize it. `RfqStack` accepts the same options when `columns` is omitted:

| Option | Type | Default | Purpose |
|---|---|---|---|
| `price` | `(value: number, row: T) => string` | Two decimals | Formats bid and ask by instrument. |
| `time` | `(ms: number) => string` | Local 24-hour time with seconds | Formats arrival time. |
| `thresholds` | `CountdownThresholds` | `{ soonMs: 10_000 }` | Countdown's provisional warning threshold, in milliseconds. |
| `clock` | `Clock` | `sharedClock()` | Countdown clock; the default ticks once a second. |

For instrument-specific prices, pass your formatter map: `price={(value, row) => conventions[row.instrument].price(value)}`. With custom `columns`, pass these options to `rfqStackColumns` yourself.

| `RfqStackRow` field | Type | Required / default | Meaning |
|---|---|---|---|
| `id` | `string` | Required | Inquiry identity. |
| `receivedAt`, `expiresAt` | `number` | Required | Arrival and deadline, in milliseconds since the epoch. |
| `instrument` | `string` | Required | Instrument label. |
| `side` | `"buy" \| "sell" \| "two-way"` | Required | Client's side, displayed as `BUY`, `SELL`, or `2-WAY`. |
| `quantity` | `number` | Required | Raw notional or contract count. |
| `quantityUnit` | `"notional" \| "contracts"` | Notional | Controls size formatting. |
| `status` | `string` | Required | Venue status, printed unchanged. |
| `client` | `string` | `–` | Client label. |
| `tier` | `string` | Omitted | Optional label beside the client. |
| `bid`, `ask` | `number \| null` | `–` | Market prices; missing values use the null token. |
| `auto` | `boolean` | `false` | Shows the auto mark and makes the row subject to the threshold. |

`formatStackSize(row)` prints millions of notional (`5_000_000` → `5mm`) or a contract count. Status changes use a flat fill flash. Side is shown as text, so color is not needed to read it.

Time left uses a compact [`countdown`](countdown.md), without a bar or tier announcements, labeled `Time left ${row.id}`. It sorts by `expiresAt`, so ticking needs no re-sort. Virtualization mounts countdowns only for visible rows and overscan.

### The order is yours

Pass `sort` for a column order or `view` for a custom comparator. Without a sort, sort rules, or custom view, rows follow store order: insertion order unless the feed supplies an explicit order.

| Comparator | Order |
|---|---|
| `byTimeLeft` | Earliest `expiresAt` first. |
| `bySize` | Largest `quantity` first. |
| `byArrival` | Newest `receivedAt` first. |
| `stackOrder(...comparators)` | First nonzero comparison wins. |

`useRfqStackView(store, options?)` creates a view for the stack and active-inquiry hook to share:

| Option | Type | Default | Purpose |
|---|---|---|---|
| `comparator` | `(a: T, b: T) => number` | Store order | Primary order; rules supply it when omitted. |
| `threshold` | `number \| null` | `null` | Auto-quote minimum in raw quantity units. |
| `filter` | `(row: T) => boolean` | All rows | Additional filter. |
| `reorderHoldMs` | `number` | `1000` | Hold duration after grid interaction. |
| `rules` | `GridRules` | None | Combines rule filters with the threshold and filter; rule sort breaks comparator ties. |
| `columns` | `readonly RuleColumn<T>[]` | `rfqStackColumns()` | Column definitions used by rules. |

Pass the same [`grid-rules`](grid-rules.md) object to the hook and stack. A supplied view owns filtering, sorting, and its hold; the grid ignores its own `filter`, `sort`, `rules.filter`, and `rules.sort` for that view. Rule colors still apply. Supply `columns` to the hook when rules refer to custom columns.

Keep comparator, filter, rule arrays, and columns stable, using module constants or `useMemo`. Changing the store or a view option replaces the view and disposes the old one; unmounting disposes it too.

### The threshold

The threshold hides only auto-quoted rows with `quantity` below it. Equality passes. Non-auto rows pass this filter but may still be hidden by other filters. `rfqThresholdFilter(minQuantity)` exports this predicate; `null`, `undefined`, zero, and negative values disable it.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `threshold` | `number \| null` | Internal state | Controlled minimum in raw quantity units. |
| `defaultThreshold` | `number \| null` | `null` | Initial uncontrolled minimum. |
| `onThresholdChange` | `(threshold: number \| null) => void` | None | Reports field edits; update a controlled threshold here. |
| `thresholdField` | `boolean` | Automatic | Shows or hides the field. |
| `thresholdUnit` | `"mm" \| "contracts"` | `"mm"` | Field scale: millions or a count. |
| `thresholdLabel` | `string` | `"Hide auto under"` | Visible and accessible field label. |

By default, the field appears when `threshold` is supplied (including `null`), `defaultThreshold` is non-null, or `onThresholdChange` is supplied. `defaultThreshold={null}` alone does not show it. Blank, nonnumeric, nonfinite, or nonpositive field input reports `null`.

The field's `5` means `5_000_000` in `mm` mode and `5` in contracts mode. This scale does not convert row quantities: use compatible units across the stack.

Without a supplied view, the grid applies the threshold with your filters. With one, control the threshold and pass it to both `useRfqStackView` and `RfqStack`, as in [Auto-quote threshold](#auto-quote-threshold). The field then reports edits; the hook applies them. Persist the threshold in your app or panel state.

### The active inquiry

`useActiveInquiry(source, options)` accepts a `RowStore<T>` or `RowView<T>`:

| Option | Type | Default | Purpose |
|---|---|---|---|
| `isEnded` | `(row: T) => boolean` | Required | Reads the venue's status to decide whether an inquiry is over. |
| `onChange` | `(id: RowId \| null, row: T \| null) => void` | None | Reports the initial choice, including `null`, and later active-id changes. Updates that leave the active id unchanged do not trigger it. |

The hook chooses the first non-ended, unparked row in source order. It keeps that inquiry through arrivals and reordering until it ends, leaves the store, is parked, or the trader chooses another. Filtering it out of a view does not clear the active choice. Countdown expiry alone has no effect.

| Return value | Type | Behavior |
|---|---|---|
| `activeId`, `row` | `RowId \| null`, `T \| null` | Current inquiry, or `null` when no eligible inquiry remains. |
| `setActive` | `(id: RowId \| null) => void` | Picks an existing non-ended row and unparks it. `null`, missing, or ended ids fall back to automatic selection. |
| `next` | `() => void` | Selects the first eligible row other than the current one, even before the server ends it. Keeps the current inquiry if no alternative exists. |
| `park`, `unpark` | `(id: RowId) => void` | Excludes or restores a row for automatic selection. |
| `parked` | `ReadonlySet<RowId>` | Local parked ids, for the stack's `parkedIds` prop. |

Pass `activeId` to mark the row with `data-state="active"` and a left bar. Key the ticket by `active.activeId` so its draft belongs to that inquiry.

Parking keeps the row in the stack and skips it during automatic selection; parking the active inquiry advances the ticket. Unparking restores eligibility without replacing another active inquiry. Parked rows are muted, use `data-state="parked"`, and have an accessible description of `Parked` unless `getRowProps` supplies one. The active mark takes precedence. Parking sends nothing to the server. The hook prunes removed rows from the parked set when it next renders.

<a id="arrival-never-moves-anything"></a>

### Arrival and reorder behavior

With preset defaults, arrivals preserve the first visible row by adjusting scroll position by the inserted rows' height. Focus and the active mark follow row ids. Viewport pinning requires that the previous first visible row still exists; `rowEnter.pinViewport: false` disables it.

Grid key presses outside an editor and pointer-downs in the body start or extend the reorder hold. Existing rows keep their relative order while held; new rows append, while removed or filtered-out rows disappear. The view settles to its current sort when the hold expires, even without another feed update. This does not prevent movement caused by removals or by the eventual re-sort. Set `reorderHoldMs` on the view when supplying your own.

### What it does not do

Your app fetches data, defines the ordering and end statuses, and persists the threshold. Quote, pass, and stop actions belong to the ticket; the stack provides activation and your context-menu items.
