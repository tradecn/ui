# window-set

Which windows a desk has, which layout each shows, and where each sits, as data with its boundaries, and a controller that drives your shell's own calls to open a window, close one, hear one close, and read the bounds back.

## Usage

```tsx
import { createWindowSet, readWindowSet, windowSetOf, writeWindowSet, type WindowAdapter } from "@/lib/window-set"
```

```tsx
// Your shell behind four functions: a Tauri WebviewWindow, an Electron BrowserWindow through a preload bridge.
const adapter: WindowAdapter = {
  open: (id, url) => shell.openWindow(id, url),
  close: (id) => shell.closeWindow(id),
  onClosed: (cb) => shell.onWindowClosed(cb),
  bounds: (id) => shell.windowBounds(id),
}
const windows = createWindowSet(adapter)

// On launch: the stored set, or a first desk of one window.
await windows.restore(readWindowSet(prefs) ?? windowSetOf([{ id: "main", layoutId: "desk", main: true }]))

// On quit: what is open now, and where the shell says it sits.
prefs = writeWindowSet(prefs, await windows.snapshot())
```

Every window loads the same app and reads `?window=<id>&layout=<layoutId>` to know which it is and which layout to mount. [Desktop shells](shells.md) puts the whole shape in one place, with a recipe for a Rust-hosted shell and a Node-hosted one.

## API Reference

For a shell whose windows are separate JavaScript contexts, [`workspace`](workspace.md) says: one `Workspace` per window, its layout saved under the window's id. This lib is the record of those windows and the driver that opens them. It imports no shell package, touches no storage, and holds no layout: layouts live wherever you keep them, keyed by `layoutId`, in a [`layout-manager`](layout-manager.md) template or a file.

### The set

| Field | Type | Purpose |
|---|---|---|
| `version` | `1` | The shape's version. |
| `kind` | `"tradecn-window-set"` | What the payload is, so a layout or a preferences envelope is never mistaken for one. |
| `windows` | `WindowRecord[]` | The windows, in the order they open after the main one. |
| `boundaries` | `WindowSetBoundaries` | What the writer put in and what it kept out. |

Each `WindowRecord`:

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | `string` | Yes | The shell's name for the window: a Tauri label, an Electron window's key in your own map. |
| `layoutId` | `string` | Yes | The layout this window shows, keyed however you keep layouts. |
| `bounds` | `{ x, y, width, height }` | No | Where the window sits, in the shell's pixels. Kept only when whole and the size is positive. |
| `display` | `string` | No | The display it sits on, as the shell names it. |
| `main` | `boolean` | No | The window that opens first and whose close ends the desk. One at most; the first keeps it. |

`windowSetOf(records, boundaries?)` makes a set: duplicate ids are dropped after the first, every `main` but the first is cleared, and the records are copied. `mainWindow(set)` is the main record, else the first.

### Boundaries

`WINDOW_SET_BOUNDARIES` says, in the language [`preferences`](preferences.md) and the workspace layout use, what a set carries and for whom:

| Boundary | In it | Meaning |
|---|---|---|
| `template` | `window-ids`, `layout-ids`, `main-window` | Travels as a desk template: which windows, showing which layouts. |
| `user` | `bounds`, `display` | The person's own: where each window sits, on which screen. |
| `session` | `open-state`, `focus` | Stored by nobody. What is open comes from the shell every launch. |

A set travels in a preferences slot: `readWindowSet(prefs, slot?)` and `writeWindowSet(prefs, set, slot?)` read and write `WINDOW_SET_SLOT`, `windows`, at version 1. Name the slot under the envelope's `template` boundary to hand a desk's windows to a colleague, or leave it under `user` to keep the positions to yourself.

### Parsing

`parseWindowSet(value)` takes an object or JSON text on no trust: a malformed record is dropped and the rest kept, boundaries that are not lists of words fall back to this lib's, and anything that is not a set at version 1 is null. `parseWindowRecord(value)` is the same for one record.

### The adapter

| Function | Purpose |
|---|---|
| `open(id, url, record)` | Open a window with this id at this url. Resolve when it exists. |
| `close(id)` | Close it. |
| `onClosed(cb)` | Hear the shell close a window on its own, by the person or the system; return what stops listening. |
| `bounds(id)` | Optional. Where the window is now, for a snapshot; null leaves the record's own bounds in place. |

Each may return a promise. The url is `defaultWindowUrl(record)`, the document's own path with `?window=<id>&layout=<layoutId>`, unless the controller is given a `url` function.

### The controller

`createWindowSet(adapter, { url?, boundaries? })` returns:

| Method | Returns | Purpose |
|---|---|---|
| `restore(set)` | `Promise<WindowRecord[]>` | Open every window of the set that is not open, the main one first. Resolves to the records it opened. |
| `open(record)` | `Promise<boolean>` | Open one. False when it was open already. |
| `close(id)` | `Promise<boolean>` | Close one through the shell. False when it was not open. |
| `closeAll()` | `Promise<void>` | Close every open window. |
| `windows()` | `readonly WindowRecord[]` | The open windows, in the order they opened. |
| `isOpen(id)` | `boolean` | Whether the shell has this window. |
| `snapshot()` | `Promise<WindowSet>` | The open windows, each with the bounds the shell reports now. |
| `subscribe(cb)` | `() => void` | Hear a window open or close. |
| `dispose()` | `void` | Stop listening to the shell. Closes nothing. |

A close the shell makes on its own, the person pressing a window's X, reaches the set through `onClosed` and leaves it the same way a `close` does, once. Make the controller once per app, not per render: it holds the shell's listener.

### What it does not do

It does not open windows, position them, or know a shell. It does not hold layouts, only their ids, and it does not decide what a window shows: mount a `Workspace` in each window and load the layout the query names.
