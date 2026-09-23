# row-store

Applies feed batches and lets components subscribe to individual rows.

## Usage

```tsx
import { memo, useState } from "react"
import { useRow, useRowIds } from "@/hooks/use-row-store"
import { createRowStore, type RowStore } from "@/lib/row-store"

interface Quote { id: string; price: number }

const QuoteRow = memo(function QuoteRow({ store, id }: { store: RowStore<Quote>; id: string }) {
  const quote = useRow(store, id)
  if (!quote) return null
  return (
    <tr className="border-t">
      <th scope="row" className="px-3 py-1 text-left font-medium">{id}</th>
      <td className="px-3 py-1 text-right">{quote.price.toFixed(2)}</td>
    </tr>
  )
})

function Quotes() {
  const [store] = useState(() => {
    const store = createRowStore<Quote>({ getRowId: (quote) => quote.id })
    store.applyDeltas({ upsert: [{ id: "ALPHA", price: 99.5 }, { id: "BETA", price: 100.25 }] })
    return store
  })
  const ids = useRowIds(store)
  const update = () => store.applyDeltas({ patch: [{ id: "ALPHA", fields: { price: store.getRow("ALPHA")!.price + 0.01 } }] })
  return (
    <>
      <div data-demo-controls className="text-xs">
        <button type="button" className="rounded border px-2 py-1" onClick={update}>Update ALPHA</button>
      </div>
      <div className="w-fit max-w-full overflow-auto rounded border text-xs lining-nums tabular-nums">
        <table aria-label="Quotes">
          <thead className="text-muted-foreground"><tr><th scope="col" className="px-3 py-1 text-left font-medium">Symbol</th><th scope="col" className="px-3 py-1 text-right font-medium">Price</th></tr></thead>
          <tbody>{ids.map((id) => <QuoteRow key={id} store={store} id={id} />)}</tbody>
        </table>
      </div>
    </>
  )
}
```

Update ALPHA applies one patch; BETA's snapshot stays unchanged. `useRowIds` subscribes to the id list, and each `useRow` subscribes to its own quote. `memo` lets an unchanged row skip a parent render when the list changes. The button stands in for an already-batched feed callback.

## Applying a batch

Apply feed batch inserts GAMMA, patches ALPHA, removes BETA, and reports producer metadata in one call. The row count stays at two. Finish replay applies only metadata: it clears the gap and advances the sequence while retaining the cumulative drop count.

The seed is batch 1, the mixed update is batch 2, and the metadata-only update is batch 3. Reset creates a fresh store so the rows and metadata can be inspected again from the start. A producer supplies drop and gap information; the store does not detect missing feed messages.

<!-- demo: row-store-deltas -->

## Batching individual messages

Use `createFrameBatcher` when messages arrive one at a time. Queue three messages sends two price patches around a size patch. The next animation frame applies one batch: the later price wins, and the size field is retained. The first burst produces a price of `100.03` and size `200`.

Messages received counts every queued message; Batches applied excludes the seed. Multiple bursts before the same frame share one batch. Queue then cancel discards the queued batch without changing the store. The next burst continues the sample feed's prices, so canceled values are skipped. Cleanup also calls `cancel()` on unmount. Call `flush()` when queued work must apply immediately; an already-batched feed should call `applyDeltas` directly.

<!-- demo: row-store-batching -->

## Sorted and filtered views

This view includes nonnegative changes, highest first, while the store retains insertion order. BETA starts below zero and is hidden. Hold and raise BETA calls `touch()` before changing it to `+0.03`: it appears at the end during the two-second hold, then moves to the top without another feed update. Reset restores the original values for another pass.

Static options stay at module scope. `useView` replaces the view when its store or options change and disposes the active view on unmount. The table uses the view's ids and subscribes to each row in the underlying store.

<!-- demo: row-store-views -->

## API Reference

You own the feed and call `applyDeltas` once per frame. `useRow(store, id)` subscribes to that row's snapshot; unrelated updates leave its object identity unchanged. React batches a call's notifications into one render pass over the affected rows.

Choose the path that matches your feed:

- **Already batched per frame:** call `applyDeltas` from the event listener, as with a desktop app's native process. Another animation-frame wait adds latency.
- **One message at a time:** push deltas into `createFrameBatcher(store.applyDeltas, { getRowId })`, as with WebSocket or polling. It coalesces row writes, merging patch fields with later values winning, and applies the result on the next animation frame.

### Views

`store.createView(options)` makes a sorted, filtered id list. `useRowIds(view)` returns the same array until its ids or their order change. All view options are optional:

| Option | Type | Default | Purpose |
|---|---|---|---|
| `comparator` | `(a: T, b: T) => number` | Store order | Sort rows by your prioritization rule. |
| `filter` | `(row: T) => boolean` | All rows | Include rows that pass. |
| `reorderHoldMs` | `number` | `0` | Hold duration in milliseconds after `touch()`; `0` disables it. |
| `now` | `() => number` | `Date.now` | Clock in milliseconds for the hold. |

Grid key and pointer handling calls `view.touch()` to start or extend the hold. Remaining rows keep their relative order; new matches append, while removed rows and rows that fail the filter disappear. When the hold expires, the view settles to the comparator's order (or store order), even on a quiet feed.

Use `useView(store, options)` when a component owns its view. Keep `options` stable with `useMemo`: a new options object or store triggers replacement in an effect. `null` options replace the view with `null`. The hook disposes replaced views and cleans up on unmount. It also recreates a view disposed by StrictMode's development mount rehearsal; a memo with a cleanup effect alone would keep returning that disposed view.

For a manually created view, call `view.dispose()` when finished. `view.isDisposed()` then returns `true`, and the view stops following the store.

### Meta

`useStoreMeta(store)` returns a new snapshot for each batch, including empty batches, and for `clear()`. Producer fields omitted from `applyDeltas` metadata retain their previous values.

| Field | Type | Initial value | Meaning |
|---|---|---|---|
| `version` | `number` | `0` | Increments per batch or `clear()`. |
| `size` | `number` | `0` | Current row count. |
| `lane` | `"coalesced" \| "ordered"` | Store option, otherwise `"coalesced"` | Latest reported lane. |
| `dropped` | `number` | `0` | Cumulative producer drop count. |
| `seq` | `number \| null` | `null` | Last supplied sequence number. |
| `gap` | `boolean` | `false` | Producer reports a gap with replay in progress. |
| `lastBatchAt` | `number \| null` | `null` | Store clock at the last batch or `clear()`, milliseconds since epoch. |
| `producedAt` | `number \| null` | `null` | Last supplied producer timestamp, milliseconds since epoch. |

Map this metadata to a `FeedDescriptor` for the [`feed-health`](feed-health.md) strip.

### What it does not do

The store owns rows and subscriptions. Fetching, reconnection, IPC, persistence, and schema validation are yours. The store itself runs no animation-frame loop; the optional batcher schedules queued work.
