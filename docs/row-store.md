# row-store

Applies feed batches and lets components subscribe to individual rows.

## Usage

```ts
import { createFrameBatcher, createRowStore } from "@/lib/row-store"
import { useRow, useRowIds, useStoreMeta, useView } from "@/hooks/use-row-store"
```

```ts
const store = createRowStore<Quote>({ getRowId: (q) => q.id, lane: "coalesced" })

// once per frame, with everything that changed
store.applyDeltas({ upsert: [...], patch: [{ id, fields }], remove: [...], meta: { dropped: 3 } })

// in a row component
const quote = useRow(store, id)
```

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
