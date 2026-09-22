# alert-store

A store for notices over the row store's ordered lane: a repeat with the same key grows a count instead of adding a row, and a cap keeps the list to a size.

## Usage

```ts
import { createAlertStore, type Alert } from "@/lib/alert-store"
```

```ts
const alerts = createAlertStore({ max: 500 })
alerts.push({ key: "md:slow", severity: "warning", tone: "stale", title: "Feed slow", message: "1.2 s behind", allowedActions: ["reconnect"] })
alerts.push({ key: "md:slow", severity: "critical", tone: "destructive", title: "Feed slow", message: "4 s behind", allowedActions: ["reconnect"] }) // one row, count 2
alerts.list() // newest first
alerts.dismiss(id)
alerts.store // a RowStore<Alert>, for a grid, a view, or useRowIds
```

## API Reference

### A notice

`Alert { id, key?, at, seq, severity, tone?, title, message?, count, allowedActions?, meta? }`. `severity` is your word or the server's, printed as it is; `tone` a token name beside it; `allowedActions` the ids of what may be offered, and no list means nothing; `meta` JSON of your own. `push` fills `id`, `at` (from `now`, `Date.now` by default), `seq` (the arrival order in this store, counting up from one), and `count` (1) when they are left out, and returns the row as stored. `byNewest` orders by `at` and then by `seq`, so two notices pushed in one millisecond keep their push order.

### Coalescing

A notice with a `key` that an existing row carries does not add a row. The existing row takes the new words, time, tone, and allowed actions, and its `count` grows by the newcomer's (1 unless given). Dismissing the row forgets the key, so the next notice with it starts a fresh row at a count of one. A notice with no key is always a new row.

### The cap

`max` (500 by default) is how many rows there are at most. When a newcomer would go over, the oldest notices without an allowed action go first, then the oldest with one, and the newcomer itself is never the one dropped. One `applyDeltas` per push, so a subscriber wakes once.

### The rows

`store` is a `RowStore<Alert>` on the ordered lane, so the [`data-grid`](data-grid.md), a view with `byNewest` as its comparator, or `useRowIds` read it like any feed. `list()` is every notice newest first, `size()` the count, `dismiss(ids)` and `clear()` remove.

### What it does not do

It has no timers, no toast, and no opinion: what a severity means, when a notice is over, and what an action does are the consumer's. [`alerts`](alerts.md) is the strip over it.
