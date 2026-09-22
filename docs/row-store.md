# row-store

The seam between your feed and the components: one delta batch per frame in, one row's changes per subscriber out.

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

You own the feed; the store owns the rows; components subscribe to one row each. `useRow` re-renders for a change to its row and for nothing else. Every notification fired inside one `applyDeltas` lands in one React commit, so a batch that touches two thousand rows is one render pass over those rows, not two thousand.

Two kinds of consumer:

- A core that already paces one batch per frame (a desktop app with a native process on the socket) calls `applyDeltas` straight from its event listener. Adding an animation-frame wait would add a frame of latency for nothing.
- A feed that delivers messages one at a time (WebSocket, polling) pushes each message into `createFrameBatcher(store.applyDeltas, { getRowId })`. The batcher merges them, last write wins per row, and applies once on the next animation frame.

### Views

`store.createView({ comparator, filter, reorderHoldMs })` is a sorted, filtered id list a grid renders from. `useRowIds(view)` gives the ids; they are a stable array until the order actually changes. `reorderHoldMs` is the rule that keeps rows from moving under the cursor: after `view.touch()` (the grid calls it on every key and pointer interaction) the order is frozen for that long. New rows append, removed rows vanish, nothing moves. When the hold lapses the view settles to the comparator's order, even on a quiet feed. The comparator is where a desk's prioritization rule plugs in. A component that owns its view takes it from `useView(store, options)`, which makes the view for the options given, remakes it for new ones (keep the object's identity stable with a `useMemo`), disposes it on the way out, and survives StrictMode's mount rehearsal in development, where a view made in a memo and disposed in an effect's cleanup would stop following the store. `view.isDisposed()` says whether a view still does.

### Meta

`useStoreMeta(store)` gives `version`, `size`, `lane`, cumulative `dropped`, last `seq`, `gap`, `lastBatchAt`, and `producedAt`, updated once per batch. Map it to a `FeedDescriptor` for the [`feed-health`](feed-health.md) strip.

### What it does not do

Fetching, reconnection, IPC, persistence, schema validation. It does not own an animation-frame loop. It is a Map and some subscriptions, on purpose.
