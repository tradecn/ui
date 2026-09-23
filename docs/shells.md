# Desktop shells

A desktop shell gives a desk several windows, and each window is its own JavaScript context, so a terminal built from these items is one `Workspace` per window with a few things wired between them; this page puts that shape in one place, with a recipe for a Rust-hosted shell and a Node-hosted one.

## One window is one context

In a browser, popouts share a JavaScript context with the page that opened them, and `workspace` uses that: a popout panel is the same React tree drawn in another window. A desktop shell is different. A Tauri webview and an Electron `BrowserWindow` each run their own copy of the app, with their own module state, their own React tree, and no shared memory. Nothing crosses between them but messages the shell carries.

That changes the shape, not the items. Each window mounts its own `Workspace` with its own stores and its own layout; the shell opens and closes windows; and three things travel between them by message: which symbol a link group is on, when a layout or a preference changed, and, on launch, which windows to open where.

## The shape

| Piece | Where it lives | Item |
|---|---|---|
| A workspace and its panels | One per window, with `popout` actions left out | [`workspace`](workspace.md), [`panel`](panel.md) |
| The layout a window shows | One per window, keyed by the window's `layoutId` | [`layout-manager`](layout-manager.md) templates, or a file |
| Link groups | One store per window over a `LinkTransport` built from the shell's events | [`panel`](panel.md), `createCallbackTransport` |
| Hotkeys | One `HotkeysProvider` per window; a chord is heard by the window that has focus | [`use-hotkeys`](use-hotkeys.md) |
| Preferences | One envelope per window for what is the window's, one for the desk | [`preferences`](preferences.md) |
| Which windows there are | One set, restored on launch and snapshotted on quit | [`window-set`](window-set.md) |
| The session | One guard per window, all reading the same end | [`session-guard`](session-guard.md) |

Every window loads the same page and reads its own id and layout from the query, `?window=<id>&layout=<layoutId>`, which is what `defaultWindowUrl` writes. The main window restores the set; the others mount what the query names.

```tsx
const params = new URLSearchParams(location.search)
const windowId = params.get("window") ?? "main"
const layoutId = params.get("layout") ?? "desk"

<HotkeysProvider bindings={BINDINGS}>
  <LinkGroupProvider transport={transport}>
    <Workspace panels={PANELS} seed={(api) => api.load(layouts.get(layoutId))} onLayoutChange={(layout) => layouts.set(layoutId, layout)} />
  </LinkGroupProvider>
</HotkeysProvider>
```

## A Rust-hosted shell: Tauri 2

Tauri's `WebviewWindow` opens a window from the page; its label is the window's id. The adapter for `createWindowSet` is four calls on it, and the link transport is the event system, which reaches every window.

```ts
import { emit, listen } from "@tauri-apps/api/event"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { createCallbackTransport } from "@/lib/link-group"
import { createWindowSet, type WindowAdapter } from "@/lib/window-set"

// A window per record, at the record's bounds when it has them. Closing one from its own X reaches onClosed.
const closed = new Set<(id: string) => void>()
const adapter: WindowAdapter = {
  async open(id, url, record) {
    const win = new WebviewWindow(id, { url, ...record.bounds })
    await win.onCloseRequested(() => {
      for (const cb of closed) cb(id)
    })
  },
  async close(id) {
    await (await WebviewWindow.getByLabel(id))?.close()
  },
  onClosed(cb) {
    closed.add(cb)
    return () => closed.delete(cb)
  },
  async bounds(id) {
    const win = await WebviewWindow.getByLabel(id)
    if (!win) return null
    const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()])
    return { x: pos.x, y: pos.y, width: size.width, height: size.height }
  },
}
export const windows = createWindowSet(adapter)

// Link groups across windows: every window emits on one event and listens to it.
export const transport = createCallbackTransport({
  send: (message) => void emit("tradecn-link", message),
  receive: (handler) => {
    const stop = listen("tradecn-link", (event) => handler(event.payload))
    return () => void stop.then((unlisten) => unlisten())
  },
})
```

`WebviewWindow.getCurrent()` is the window the code runs in, for the guard, the preferences, and the layout it should mount. `onCloseRequested` fires for a close the person asked for; a `close()` the set made goes through the same handler, and the set drops the duplicate.

## A Node-hosted shell: Electron

Electron opens windows in the main process, so the page reaches it through a preload bridge. The bridge is a few functions on `window.shell`; the adapter and the transport are written against them.

```ts
// preload.ts: what the page may call and hear.
import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("shell", {
  openWindow: (id: string, url: string, bounds?: unknown) => ipcRenderer.invoke("windows:open", { id, url, bounds }),
  closeWindow: (id: string) => ipcRenderer.invoke("windows:close", id),
  windowBounds: (id: string) => ipcRenderer.invoke("windows:bounds", id),
  onWindowClosed: (cb: (id: string) => void) => {
    const listener = (_: unknown, id: string) => cb(id)
    ipcRenderer.on("windows:closed", listener)
    return () => ipcRenderer.off("windows:closed", listener)
  },
  sendLink: (message: unknown) => ipcRenderer.send("link", message),
  onLink: (cb: (message: unknown) => void) => {
    const listener = (_: unknown, message: unknown) => cb(message)
    ipcRenderer.on("link", listener)
    return () => ipcRenderer.off("link", listener)
  },
})
```

```ts
// main.ts: the windows by id, and the link relay.
import { BrowserWindow, ipcMain } from "electron"

const windows = new Map<string, BrowserWindow>()
ipcMain.handle("windows:open", (_, { id, url, bounds }) => {
  const win = new BrowserWindow({ ...bounds, webPreferences: { preload: PRELOAD } })
  windows.set(id, win)
  win.on("closed", () => {
    windows.delete(id)
    for (const other of BrowserWindow.getAllWindows()) other.webContents.send("windows:closed", id)
  })
  return win.loadURL(url)
})
ipcMain.handle("windows:close", (_, id) => windows.get(id)?.close())
ipcMain.handle("windows:bounds", (_, id) => windows.get(id)?.getBounds() ?? null)
// A link message from one window goes to every other window.
ipcMain.on("link", (event, message) => {
  for (const win of BrowserWindow.getAllWindows()) if (win.webContents !== event.sender) win.webContents.send("link", message)
})
```

```ts
// In the page: the adapter and the transport over the bridge.
const adapter: WindowAdapter = {
  open: (id, url, record) => shell.openWindow(id, url, record.bounds),
  close: (id) => shell.closeWindow(id),
  onClosed: (cb) => shell.onWindowClosed(cb),
  bounds: (id) => shell.windowBounds(id),
}
export const windows = createWindowSet(adapter)
export const transport = createCallbackTransport({ send: (message) => shell.sendLink(message), receive: (handler) => shell.onLink(handler) })
```

The relay in the main process is what makes the transport a broadcast: `createCallbackTransport` sends and receives, and the shell decides who hears.

## Launch and quit

On launch, the main window reads the set from its preferences and restores it; the others mount what their query names and restore nothing. On quit, the main window snapshots the set, the bounds included, and writes it back.

```ts
const stored = readWindowSet(prefs)
await windows.restore(stored ?? windowSetOf([{ id: "main", layoutId: "desk", main: true }]))

// before the app quits
prefs = writeWindowSet(prefs, await windows.snapshot())
```

Which of this is a desk template and which is the person's is the set's `boundaries`: the windows and their layouts travel as a template, the positions do not.

## What stays yours

Which shell, how windows are secured, where preferences and layouts are stored, and what a sign-in looks like. The items know none of it: they read props, call the functions they are given, and mount the same in every window.
