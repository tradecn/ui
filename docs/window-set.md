# window-set

Describe a desk's windows, layouts, and geometry as data, then open and close them through your shell's adapter. The controller tracks the windows it opens; your application owns native integration and persistence.

## Usage

```tsx
import { createWindowSet, readWindowSet, windowSetOf, writeWindowSet, type WindowAdapter } from "@/lib/window-set"
```

```tsx
// Application-owned shell service; open and close confirm native completion.
const adapter: WindowAdapter = {
  open: (id, url, record) => shell.openWindow(id, url, record),
  close: (id) => shell.closeWindow(id),
  onClosed: (cb) => shell.onWindowClosed(cb), // Returns unsubscribe synchronously.
  bounds: (id) => shell.windowBounds(id),
}
const windows = createWindowSet(adapter)

// On launch: the stored set, or a first desk of one window.
await windows.restore(readWindowSet(prefs) ?? windowSetOf([{ id: "main", layoutId: "desk", main: true }]))

// Before closing windows: snapshot, then durably save through your storage service.
prefs = writeWindowSet(prefs, await windows.snapshot())
await persistPreferences(prefs)
```

Create one controller in the desk's owner and await one startup restore. It starts empty and does not discover native windows. Make the adapter's `open` idempotent so it can adopt an existing initial window. Before a quit snapshot, stop new operations and wait for pending ones to finish; persist before destroying any windows.

Every window loads the app and reads `?window=<id>&layout=<layoutId>` to choose its identity and layout. [Desktop shells](shells.md) covers owner placement, initial-window adoption, entry URLs, geometry, and close/quit coordination for Tauri and Electron. The `shell`, `prefs`, and `persistPreferences` above belong to your application.

## API Reference

For separate JavaScript contexts, mount one [`Workspace`](workspace.md) per window. Keep layouts under each `layoutId`, in a [`layout-manager`](layout-manager.md) template or your own storage. This library imports no shell package and stores no layouts.

### The set

`WindowSet` fields are all required:

| Field | Type | Value or purpose |
|---|---|---|
| `version` | `1` | `WINDOW_SET_VERSION`. |
| `kind` | `"tradecn-window-set"` | `WINDOW_SET_KIND`; distinguishes a set from a layout or preferences envelope. |
| `windows` | `WindowRecord[]` | Records in restore order, except that the main record goes first. |
| `boundaries` | `WindowSetBoundaries` | Ownership metadata, defaulting to `WINDOW_SET_BOUNDARIES` in the helpers. |

Each `WindowRecord`:

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | `string` | Yes | The shell's window name, such as a Tauri label or a key in your Electron window map. |
| `layoutId` | `string` | Yes | The key used to load this window's layout. |
| `bounds` | `WindowBounds` | No | Saved geometry in the units and frame convention your adapter uses. |
| `display` | `string` | No | Application metadata naming the display; the controller does not discover or move displays. |
| `main` | `boolean` | No | Selects the first record to restore. Closing it does not automatically close the desk. |

`WindowBounds` has four required numbers. Choose physical or logical pixels, and outer or content size, consistently between the adapter's reads and writes; see the shell recipes above.

| Field | Type | Purpose |
|---|---|---|
| `x`, `y` | `number` | Window position. Negative coordinates are allowed by the parser. |
| `width`, `height` | `number` | Window size. The parser requires both to be positive. |

`windowSetOf` keeps the first record for each id and the first retained `main: true` marker. It shallow-copies records, leaving nested bounds shared, and does not validate typed inputs. `mainWindow` returns the marked record, otherwise the first, or `undefined` for an empty set.

### Boundaries

`WindowSetBoundary` is `"template" | "user" | "session"`. `WindowSetBoundaries` has these three required, readonly arrays of strings; `WINDOW_SET_BOUNDARIES` supplies their defaults:

| Boundary | Default entries | Intended ownership |
|---|---|---|
| `template` | `window-ids`, `layout-ids`, `main-window` | The desk's window and layout identities. |
| `user` | `bounds`, `display` | The person's geometry and screens. |
| `session` | `open-state`, `focus` | Live state, rebuilt during use rather than persisted as fields. |

These labels do not remove fields. [`preferences`](preferences.md) exports whole slots: marking the `windows` slot as `template` also exports any saved `bounds` and `display`. Remove those fields from a copy before writing a shareable template. An unclassified preferences slot defaults to `user`.

`readWindowSet` and `writeWindowSet` use `WINDOW_SET_SLOT` (`"windows"`) unless given another slot name. Writing puts the set in a version 1 slot without changing the envelope's boundary assignment or saving it to storage.

### Parsing

Use parsers for untrusted values. `parseWindowRecord` accepts an object with nonblank string `id` and `layoutId`, preserving their original spelling and whitespace. It keeps only complete, finite bounds with positive width and height; fractional values are valid. Invalid bounds are omitted without dropping the record. It keeps a nonempty string `display` and only `main: true`, and drops unknown fields. It does not parse JSON text on its own.

`parseWindowSet` accepts an object or JSON text with kind `"tradecn-window-set"`, version `1`, and a `windows` array. It drops invalid records, normalizes duplicates and main markers, and returns `null` for an invalid envelope or invalid JSON. Boundaries must supply all three arrays of strings; otherwise the entire boundary value falls back to `WINDOW_SET_BOUNDARIES`. Empty arrays and empty strings in those arrays are accepted.

| Helper | Inputs and defaults | Returns |
|---|---|---|
| `windowSetOf(windows?, boundaries?)` | `windows: readonly WindowRecord[] = []`; `boundaries: WindowSetBoundaries = WINDOW_SET_BOUNDARIES` | `WindowSet`; normalizes trusted records. |
| `mainWindow(set)` | `set: WindowSet` | `WindowRecord \| undefined`. |
| `parseWindowRecord(value)` | `value: unknown` | `WindowRecord \| null`. |
| `parseWindowSet(value)` | `value: unknown` | `WindowSet \| null`. |
| `readWindowSet(prefs, slot?)` | `prefs: Preferences`; `slot: string = WINDOW_SET_SLOT` | `WindowSet \| null`; parses the slot's value, or returns `null` if absent or invalid. |
| `writeWindowSet(prefs, set, slot?)` | `prefs: Preferences`; `set: WindowSet`; `slot: string = WINDOW_SET_SLOT` | `Preferences`; writes a JSON copy of the set into the slot. |
| `defaultWindowUrl(record)` | `record: WindowRecord` | `string`; the current `location.pathname` plus `?window=<id>&layout=<layoutId>`, with both values URL-encoded. Without a pathname, returns the query alone. |

### The adapter

Supply a `WindowAdapter` to `createWindowSet`. Only `bounds` is optional.

| Method | Inputs | Returns | Contract |
|---|---|---|---|
| `open(id, url, record)` | `id: string`; `url: string`; `record: WindowRecord` | `void \| Promise<void>` | Adopt or create the window and apply its record. Complete after successful native setup; reject failures. |
| `close(id)` | `id: string` | `void \| Promise<void>` | Complete after confirmed closure. Reject cancellation so the controller can keep tracking the window. |
| `onClosed(cb)` | `cb: (id: string) => void` | `() => void` | Subscribe to completed native closures and return unsubscribe synchronously. |
| `bounds(id)` | `id: string` | `WindowBounds \| null \| undefined \| Promise<WindowBounds \| null \| undefined>` | Read current geometry for a snapshot; `null` or `undefined` keeps the saved bounds. |

Prepare any asynchronous native event registration before constructing the controller. A close request alone does not fulfill `close`: once it resolves, the controller removes the record even if the native window still exists. Forward completed native closures through `onClosed`, including ones the controller did not request.

The default URL is a path and query, not an absolute shell entry URL. Supply `options.url` or resolve the record to your shell's entry point in `open`. The controller passes geometry and display metadata to the adapter; it does not position windows itself.

### The controller

`createWindowSet(adapter: WindowAdapter, options?: WindowSetOptions)` returns a `WindowSetController`. Options default to `{}`:

| Option | Type | Default | Purpose |
|---|---|---|---|
| `url` | `(record: WindowRecord) => string` | `defaultWindowUrl` | Build the URL passed to `adapter.open`. |
| `boundaries` | `WindowSetBoundaries` | `WINDOW_SET_BOUNDARIES` | Metadata for snapshots. `restore` does not adopt the restored set's boundaries. |

| Method | Inputs | Returns | Behavior |
|---|---|---|---|
| `restore(set)` | `set: WindowSet` | `Promise<WindowRecord[]>` | Try the main record first, then the rest in order, awaiting each open it starts. Returns the input records it opened; skips tracked ids and ids already opening. |
| `open(record)` | `record: WindowRecord` | `Promise<boolean>` | `true` after successful adapter completion; `false` if the id is tracked or already opening. |
| `close(id)` | `id: string` | `Promise<boolean>` | `true` after adapter completion; `false` if the id is untracked or already closing. |
| `closeAll()` | None | `Promise<void>` | Close the currently tracked ids sequentially, in their insertion order. |
| `windows()` | None | `readonly WindowRecord[]` | A new array of tracked records, in successful-open order. The records themselves are shared. |
| `isOpen(id)` | `id: string` | `boolean` | Whether this controller tracks the id; does not query the shell. |
| `snapshot()` | None | `Promise<WindowSet>` | Read bounds sequentially for tracked records and build a normalized set using the controller's boundaries. |
| `subscribe(cb)` | `cb: () => void` | `() => void` | Listen for tracked opens and closes; returns unsubscribe. No initial callback. |
| `dispose()` | None | `void` | Unsubscribe from the shell and clear current subscribers. Does not close windows or clear records. |

A pending open is not yet tracked, so `isOpen` is false and `close` returns false for that id. Duplicate opens and closes return false without waiting for the original operation. Concurrent restores can therefore open a secondary while another restore is still opening main. Coordinate startup, snapshots, and shutdown in the owner; the controller does not serialize all operations or expose a separate readiness signal.

An `adapter.open` failure rejects without adding the record; an `adapter.close` failure leaves it tracked unless a native close notification already removed it. `restore` and `closeAll` stop at the first rejection without rolling back earlier successes. A rejected bounds read rejects `snapshot`; bounds returned successfully are trusted without parser validation.

Subscriber callbacks run synchronously. A throw stops later callbacks and can reject `open` or `close` after its tracked state has changed.

Native closure and requested-close completion notify only when they remove a tracked record. Wait for a pending close to finish before reopening its id: the old close can otherwise remove the new record. `dispose` leaves pending operations running and methods callable, so finish operations before disposing and stop using that controller afterward.

### What it does not do

Native discovery, window creation and positioning, main-window shutdown policy, layout loading, and durable storage belong to the application. The controller calls your adapter and tracks the results. Mount a `Workspace` in each window and load the layout identified by its record or query.
