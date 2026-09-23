# alert-store

A capped notice store on the row store's ordered lane. Repeated keys update an existing notice and grow its count.

## Usage

```ts
import { createAlertStore, type Alert } from "@/lib/alert-store"
```

```ts
const alerts = createAlertStore({ max: 500 })
const first: Alert = alerts.push({ key: "md:slow", severity: "warning", tone: "stale", title: "Feed slow", message: "1.2 s behind", allowedActions: ["reconnect"] })
alerts.push({ key: "md:slow", severity: "critical", tone: "destructive", title: "Feed slow", message: "4 s behind", allowedActions: ["reconnect"] }) // one row, count 2
alerts.list() // newest first
alerts.dismiss(first.id)
alerts.store // a RowStore<Alert>, for a grid, a view, or useRowIds
```

## API Reference

### A notice

`push(input: AlertInput)` accepts the fields below and returns an `Alert`. Only `severity` and `title` are required inputs. Stored alerts also require `id`, `at`, `seq`, and `count`; the store supplies them as described here.

| Field | Type | Push default | Purpose |
|---|---|---|---|
| `id` | `string` | `nextId()` for a new row | Row identity. A coalescing push keeps the existing id, ignoring this input. |
| `key` | `string` | Omitted | Groups repeats; the empty string is also a key. |
| `at` | `number` | `now()` | Event time in milliseconds since the epoch. |
| `seq` | `number` | Generated; not an input | Arrival order, incremented on every push from one, including repeats. |
| `severity` | `string` | Required | Your word or the server's, such as `info`, `warning`, or `fill`; the UI prints it unchanged. |
| `tone` | `AlertTone` | Omitted | Optional color token beside the severity. |
| `title` | `string` | Required | Notice heading. |
| `message` | `string` | Omitted | Supporting text. |
| `count` | `number` | `1` | Initial count for a new row, or the amount added to a repeat. |
| `allowedActions` | `string[]` | Omitted | Action ids that may be offered. Omission or an empty list allows none. |
| `meta` | `{ [key: string]: AlertJson }` | Omitted | Your metadata object. |

`AlertTone` is `"up"`, `"down"`, `"flat"`, `"stale"`, `"expiring"`, `"primary"`, or `"destructive"`. `AlertJson` is a recursive JSON value: a string, number, boolean, null, array of these values, or object with these values. The store does not validate timestamps, counts, or metadata at runtime.

`byNewest(a: Alert, b: Alert): number` sorts by descending `at`, then descending `seq`. At the same timestamp, the later push leads. An explicit older `at` can put a new notice or repeat below earlier arrivals. Dismissal and clearing do not reset the sequence.

### Options

`createAlertStore(options?: AlertStoreOptions): AlertStore` accepts:

| Option | Type | Default | Purpose |
|---|---|---|---|
| `now` | `() => number` | `Date.now` | Clock in epoch milliseconds, used for omitted `at` and row-store batch timestamps. |
| `max` | `number` | `500` | Row cap. Supply a positive integer; the store does not validate it. |
| `nextId` | `() => string` | Generated id | Called when a new row has no supplied id. Return a unique id. |

The default id is `alert-<time>-<counter>`, using base-36 `Date.now()` and a counter shared across stores in the module. Injecting `now` does not change this id clock; supply `nextId` for deterministic ids.

### Coalescing

A push whose `key` matches a tracked row keeps that row's `id` and `key`. It replaces `at`, `seq`, `severity`, `title`, `tone`, `message`, `allowedActions`, and `meta`, and adds the incoming `count` (default `1`) to the existing count. Omitted optional fields become `undefined`; a repeat is not a partial update, and metadata is replaced rather than merged.

Dismissal, cap eviction, and clearing forget the removed rows' keys. A later push with one of those keys starts a fresh count using its input or the default `1`. A push without a key does not coalesce.

Give distinct live notices distinct ids, whether supplied directly or by `nextId`. Reusing an id without a matching key replaces that row without accumulating its count and can leave an old key pointing to the replacement. At the cap, the same id may also be selected for removal: the batch upserts before it removes, so the returned notice can be absent from the store.

### The cap

When adding a row would exceed `max`, the store removes existing rows to make room. Oldest notices with missing or empty `allowedActions` go first, then the oldest with a nonempty list. Oldest means the reverse of `byNewest`: earlier `at`, then earlier `seq`. Any allowed id earns this preference, even if no UI action matches it.

With unique ids, the newcomer is retained even when its timestamp is older than every existing row. Coalescing does not run eviction. Zero and negative caps still retain one newcomer; they do not disable storage.

### The rows

| Member | Type | Behavior |
|---|---|---|
| `store` | `RowStore<Alert>` | Readonly reference to the underlying ordered-lane store. |
| `push` | `(input: AlertInput) => Alert` | Adds a notice or folds a repeat into its keyed row. |
| `dismiss` | `(ids: RowId \| readonly RowId[]) => void` | Removes one or more ids in a single batch. Unknown ids are ignored; no batch runs when none are present. |
| `clear` | `() => void` | Removes all rows and forgets all keys. Notifies order and metadata listeners even when already empty. |
| `list` | `() => Alert[]` | Returns a new array of all notices, newest first. |
| `size` | `() => number` | Current number of rows, not the sum of their counts. |

`RowId` is a string. [`data-grid`](data-grid.md), views, and `useRowIds` can read `store` like any other [`row-store`](row-store.md). The underlying ids stay in insertion order; use `store.createView({ comparator: byNewest })` for a newest-first view and dispose it when finished. `list()` sorts its own array but does not clone the notice objects.

Use the alert store's methods for writes. Direct row-store mutations or edits to returned notices bypass key tracking, sequence assignment, and cap handling.

Each push uses one synchronous `applyDeltas` batch, including any evictions. Metadata listeners run once per batch; each touched row's listeners run once, so an eviction can notify both the removed row and the newcomer. Order listeners run only when ids are added or removed; coalescing alone does not notify them. A sorted view can notify when a repeat changes its order. Keep subscriber callbacks nonthrowing: an exception interrupts the remaining notifications.

### What it does not do

The store has no timers or toast integration. Your application decides what severity means, when a notice expires, and what each action does. [`alerts`](alerts.md) provides the strip, full list, and optional toast bridge over this store.
