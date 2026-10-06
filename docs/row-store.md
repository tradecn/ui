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

export default function RowStoreDemo() {
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

Update ALPHA applies one patch; BETA's snapshot stays unchanged.

`useRowIds` subscribes to the id list, and each `useRow` subscribes to its own quote. `memo` lets an unchanged row skip a parent render when the list changes. The button stands in for an already-batched feed callback.

## Applying a batch

This example uses the coalesced lane, where a producer can discard superseded ticks.

The Apply feed batch button inserts GAMMA, patches ALPHA, removes BETA, and reports three dropped ticks in one call. The row count stays at two. The Report two more drops button applies only metadata: the cumulative drop count reaches five, and the rows stay unchanged.

The seed is batch 1, the mixed update is batch 2, and the metadata-only update is batch 3. Reset creates a fresh store so the rows and metadata can be inspected again from the start.

The producer supplies the drop counts; the store does not detect drops. Feeds that must preserve every event use the ordered lane and report sequence and gap metadata instead; see [feed-health](feed-health.md).

<!-- demo: row-store-deltas -->

## Batching individual messages

Use `createFrameBatcher` when messages arrive one at a time.

The Queue three messages button sends two price patches around a size patch. The next animation frame applies one batch: the later price wins, and the size field is retained. The first burst produces a price of `100.03` and size `200`.

Messages received counts every queued message; Batches applied excludes the seed. Multiple bursts before the same frame share one batch.

Queue then cancel discards the queued batch without changing the store. The next burst continues the sample feed's prices, so canceled values are skipped.

The demo's own cleanup effect calls `cancel()` on unmount — the batcher has no lifecycle of its own. `pending()` says whether a batch is queued, and `flush()` applies queued work immediately; an already-batched feed should call `applyDeltas` directly. The batcher merges queued metadata by summing `dropped` and letting the last mention win for the rest, `gap` included — a frame that never mentions `gap` writes nothing, so a recorded gap survives a replay's quiet frames — and it takes `raf`/`caf` options for environments without animation frames.

<!-- demo: row-store-batching -->

## Sorted and filtered views

This view includes nonnegative changes, highest first, while the store retains insertion order. BETA starts below zero and is hidden.

Hold and raise BETA calls `touch()` before changing it to `+0.03`: it appears at the end during the two-second hold, then moves to the top without another feed update. Reset restores the original values for another pass.

Static options stay at module scope. `useView` owns the view's connection and stops feed work and hold timers on cleanup. The table reads the view's ids and subscribes to each row in the underlying store.

<!-- demo: row-store-views -->

## API Reference

You own the feed and call `applyDeltas` once per frame. `useRow(store, id)` subscribes to that row's snapshot; unrelated updates leave its object identity unchanged. React batches a call's notifications into one render pass over the affected rows.

### The batch

`applyDeltas(batch)` takes a `DeltaBatch`, applying `upsert`, then `patch`, then `remove`, then `order` — so removing an id beats upserting it in the same batch.

| Field | What it does |
|---|---|
| `upsert` | Whole rows. Replaces the row object, so every subscriber of that row wakes. |
| `patch` | Partial rows merged into a new object. A patch to an unknown id is ignored. |
| `remove` | Row ids to drop. |
| `order` | The authoritative order for an ordered lane. Ids not listed keep their previous relative order, after the listed ones. |
| `meta` | Producer readings: `dropped` accumulates across batches, `gap` flags a replay in progress, and `lane`, `seq`, and `producedAt` carry the last value given. Fields omitted keep their previous values. |

`createRowStore({ getRowId, lane?, now? })` names how a row yields its id, the store's default lane, and the clock that stamps `lastBatchAt` on each batch and clear — `producedAt` always comes from the batch itself.

Choose the path that matches your feed:

- **Already batched per frame:** call `applyDeltas` from the event listener, as with a desktop app's native process. Another animation-frame wait adds latency.
- **One message at a time:** push deltas into `createFrameBatcher(store.applyDeltas, { getRowId })`, as with WebSocket or polling. It coalesces row writes, merging patch fields with later values winning, and applies the result on the next animation frame.

### Views

`useView(store, options)` is the usual door: the hook prepares a view and owns its connection, as the section below describes. `store.createView(options)` is the imperative route — it connects eagerly, makes a sorted, filtered id list, and leaves disposal to you. `useRowIds(view)` returns the same array until its ids or their order change. All view options are optional:

| Option | Type | Default | Purpose |
|---|---|---|---|
| `comparator` | `(a: T, b: T) => number` | Store order | Sort rows by your prioritization rule. |
| `filter` | `(row: T) => boolean` | All rows | Include rows that pass. |
| `reorderHoldMs` | `number` | `0` | Hold duration in milliseconds after `touch()`; `0` disables it. |
| `now` | `() => number` | `Date.now` | Clock in milliseconds for the hold. |

Grid key and pointer handling calls `view.touch()` to start or extend the hold. Remaining rows keep their relative order; new matches append, while removed rows and rows that fail the filter disappear. When the hold expires, the view settles to the comparator's order (or store order), even on a quiet feed.

Use `useView(store, options)` when a component owns its view. Keep `options` stable with `useMemo` or a module constant.

New store or options identities select a new view during render; `null` options return `null` immediately. Preparation supplies sorted, filtered ids without registering the view, so server rendering and abandoned renders leave no live resources.

The hook connects after commit and disconnects on cleanup, stopping store work and hold timers. StrictMode replay and Activity hide/show reconnect the same handle.

Share that handle with child grids or other readers; they borrow its connection. Do not dispose a hook-owned view yourself. Cleanup does not set `isDisposed()`; that flag reports explicit terminal disposal.

For an imperative view, use `store.createView(options)` outside render and call `view.dispose()` when finished. It follows batches even without subscribers. Disposal is terminal: it clears listeners and timers, freezes the last snapshot, and makes later touches inert.

### Prepared views

`store.prepareView(options)` returns a `PreparedRowView<T>` for integrations that manage their own connection. React consumers normally use `useView` instead.

| Method | Behavior |
|---|---|
| `getIds()` | Returns a current, stable snapshot. Disconnected reads refresh without registering the view or notifying listeners. |
| `subscribe(listener)` | Adds a local change listener. It does not connect the view. |
| `connect()` | Follows batches and returns an idempotent release function. Multiple connections release independently; the last release stops registration and timers. |
| `touch()` | Records a hold deadline. A disconnected view starts no timer; reconnection uses only the remaining duration. |
| `holdExpiresAt?()` | Optional. When the current or most recent hold lapses or lapsed; `null` before any hold. The grid uses it to age parked arrival marks from the release, not from whenever a later commit observes it. A view without it ages marks from their arrival, so a hold longer than the highlight window swallows those flashes. |
| `dispose()` | Permanently stops the view. Further connections and touches do nothing. |

Custom `RowStore` implementations must provide a pure `prepareView` factory with these semantics. Preparation, filters, comparators and snapshot reads must not write to the store or create external resources.

Keep a read snapshot separate from notification bookkeeping so a read before reconnection cannot suppress an owed notification. See [the migration guide](migrating-v1-to-v2.md#row-store) for the custom-store update.

### Meta

`useStoreMeta(store)` returns a new snapshot for each batch, including empty batches, and for `clear()`. Producer fields omitted from `applyDeltas` metadata retain their previous values.

`applyDeltas` and `clear` publish current row, order and metadata snapshots, including the advanced version, before notifying any subscriber. Custom `RowStore` implementations must preserve this ordering so subscribers can read a consistent batch.

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
