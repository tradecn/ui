# Desktop shells

Mount one `Workspace` per native window. Give each window its own stores and layout, carry shared state over shell messages, and let one owner restore and snapshot the desk's window set.

## One window is one context

The browser popouts provided by `workspace` and `PanelPopout` keep one React tree and shared stores. Native Tauri webviews and Electron renderers run separate copies of the app. Each needs its own providers; shared symbols, layout changes, and preference changes must cross a transport or storage boundary.

The snippets below are integration fragments. The application supplies layout storage, startup, close approval, durable persistence, and the native lifecycle hooks named below. They are not tradecn APIs.

## The shape

| Piece | Where it lives | Item |
|---|---|---|
| Workspace and panels | One per window; omit browser `popout` actions | [`workspace`](workspace.md), [`panel`](panel.md) |
| Layout | One per window, loaded by `layoutId` | [`layout-manager`](layout-manager.md) templates, or a file |
| Link groups | One store per window, connected through shell messages | [`panel`](panel.md), `createCallbackTransport` |
| Hotkeys | One provider per window; the focused window hears the chord | [`use-hotkeys`](use-hotkeys.md) |
| Preferences | Window state keyed by window id; shared desk state coordinated separately | [`preferences`](preferences.md) |
| Window set | One controller in the Tauri main webview or Electron main process | [`window-set`](window-set.md) |
| Session | One guard per window, reading the same expiry | [`session-guard`](session-guard.md) |

Every renderer loads the same app with `?window=<id>&layout=<layoutId>`. `defaultWindowUrl` produces the current document's path plus that query, not an absolute URL. Choose the shell's entry point explicitly when its loading API needs something else.

```tsx
const params = new URLSearchParams(location.search)
const windowId = params.get("window") ?? "main"
const layoutId = params.get("layout") ?? "desk"

// Application-owned: BINDINGS, PANELS, layouts, and a ready transport.
<HotkeysProvider bindings={BINDINGS}>
  <LinkGroupProvider transport={transport}>
    <Workspace panels={PANELS} defaultLayout={layouts.get(layoutId)} onLayoutChange={(layout) => layouts.set(layoutId, layout)} />
  </LinkGroupProvider>
</HotkeysProvider>
```

Load the layout before mounting. Supply a `seed` callback when a missing or invalid layout should create default panels. Use distinct layout ids for independently saved windows, or coordinate writes when several windows share one.

A new `createWindowSet` has empty bookkeeping. Its adapter must adopt an existing initial native window when `restore` calls `open` for that id. Create the controller once in its owner, await one startup restore, and route later open/close requests to it. Other renderers mount their workspace without constructing another controller.

| Adapter method | Required behavior |
|---|---|
| `open(id, url, record)` | Adopt the initial window or create one; resolve after successful native creation and lifecycle registration. Reject failures. |
| `close(id)` | Resolve after confirmed destruction. Reject a canceled close so the controller keeps the record. |
| `onClosed(callback)` | Subscribe to completed destruction, including native closes; return an unsubscribe function synchronously. |
| `bounds(id)` | Return geometry in the same units and frame convention used by `open`; `null` keeps the record's saved bounds. |

The controller removes a record after `close` resolves, even if the native window remains open. A close request alone cannot satisfy this contract. These recipes put save prompts and cancellation in an application coordinator, then destroy an approved window. Route its X button through the same coordinator.

## A Rust-hosted shell: Tauri 2

Run the controller only when `WebviewWindow.getCurrent().label === "main"`. Reserve that label for the configured initial window; allow saved secondary labels such as `desk-*`. Before restoring, install the owner's lifecycle service: it watches native destruction, intercepts close requests, and keeps the main webview alive through persistence. The Rust host must also intercept application exit requests; see Launch and quit below.

[Creating a `WebviewWindow`](https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow/) returns a handle before creation finishes. Register both result listeners immediately and remove both when the result arrives:

```ts
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"

async function createWebview(id: string, url: string) {
  const win = new WebviewWindow(id, { url, visible: false })
  let succeed!: () => void
  let fail!: (error: unknown) => void
  const ready = new Promise<void>((resolve, reject) => {
    succeed = resolve
    fail = reject
  })
  const listeners = [
    win.listen("tauri://created", succeed),
    win.listen("tauri://error", (event) => fail(event.payload)),
  ]
  try {
    await Promise.all([Promise.all(listeners), ready])
    return win
  } finally {
    const registered = await Promise.allSettled(listeners)
    const stops = registered.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
    for (const stop of stops) stop()
  }
}
```

For `adapter.open`, use `await WebviewWindow.getByLabel(id) ?? await createWebview(id, url)`. Adopt the initial `main` without navigating it again; its layout comes from the startup record. For a new window, use an app-relative entry such as `index.html?window=...&layout=...`, resolved through Tauri's configured development URL or bundled assets. Register its lifecycle handlers, apply bounds, then `await win.show()`. If setup fails after creation, remove the new window and its handlers before rejecting.

Choose a geometry convention before saving. This Tauri example stores the outer position in physical pixels and **content size** in logical pixels. Convert only the content-size reading with the window's scale factor. Restore the physical position first, then the logical size on the destination monitor; this avoids interpreting a saved desktop coordinate using the starting monitor's scale. The [window APIs](https://v2.tauri.app/reference/javascript/api/namespacewindow/) and [DPI types](https://v2.tauri.app/reference/javascript/api/namespacedpi/) distinguish these units.

```ts
import { PhysicalPosition, LogicalSize } from "@tauri-apps/api/dpi"
import type { WindowBounds } from "@/lib/window-set"

async function readBounds(win: WebviewWindow): Promise<WindowBounds> {
  const [position, size, scale] = await Promise.all([win.outerPosition(), win.innerSize(), win.scaleFactor()])
  const { x, y } = position
  const { width, height } = size.toLogical(scale)
  return { x, y, width, height }
}

async function applyBounds(win: WebviewWindow, bounds: WindowBounds) {
  await win.setPosition(new PhysicalPosition(bounds.x, bounds.y))
  await win.setSize(new LogicalSize(bounds.width, bounds.height))
}
```

Clamp restored bounds to available monitors in your application. Saved physical outer bounds need migration; passing them to these helpers would change both scale and content size. `WindowRecord.display` is application metadata: the controller neither discovers displays nor relocates windows.

The lifecycle service's destruction notification must come from `tauri://destroyed`, not `onCloseRequested`. Register it before allowing the window to close. For an approved secondary close, register a destruction waiter, call `destroy()`, await the waiter, and release it in `finally`. Cancel before calling `destroy()` and reject the adapter operation. `close()` only requests closure and may be prevented; `destroy()` bypasses that request. Keep the owner's own destruction in the native host's final quit step.

Tauri event registration is asynchronous; the link store subscribes and immediately sends its initial hello. Await native listener setup before mounting `LinkGroupProvider` so a reply cannot arrive before the receiver is registered:

```ts
import { emit, listen } from "@tauri-apps/api/event"
import { createCallbackTransport } from "@/lib/link-group"

const receivers = new Set<(message: unknown) => void>()
const stopLink = await listen("tradecn-link", (event) => {
  for (const receive of receivers) receive(event.payload)
})
const transport = createCallbackTransport({
  send: (message) => { void emit("tradecn-link", message).catch(reportError) },
  receive: (handler) => {
    receivers.add(handler)
    return () => { receivers.delete(handler) }
  },
})
// Application-owned reportError handles delivery failures.
// Unmount the provider, then call stopLink() when this renderer tears down.
```

Configure [capabilities](https://v2.tauri.app/security/capabilities/) for every participating label. This example grants link events to `main` and `desk-*`; only the owner gets window management. Add your storage and native command permissions separately. The [core permission names](https://v2.tauri.app/reference/acl/core-permissions/) are:

```json
{
  "identifier": "desk-owner",
  "windows": ["main"],
  "permissions": [
    "core:event:default",
    "core:webview:allow-create-webview-window",
    "core:webview:allow-get-all-webviews",
    "core:window:allow-get-all-windows",
    "core:window:allow-close",
    "core:window:allow-destroy",
    "core:window:allow-outer-position",
    "core:window:allow-inner-size",
    "core:window:allow-scale-factor",
    "core:window:allow-set-position",
    "core:window:allow-set-size",
    "core:window:allow-show"
  ]
}
```

```json
{
  "identifier": "desk-links",
  "windows": ["desk-*"],
  "permissions": ["core:event:default"]
}
```

Keep close interception in the owner or Rust host with this split. A secondary renderer that calls window methods itself needs those permissions too. `core:event:default` includes listen, unlisten, emit, and emit-to.

## A Node-hosted shell: Electron

Keep the controller and native window map in the main process, after `app.whenReady()`. Register the already-created initial `BrowserWindow` as `main` before restoring. Renderers request operations through a narrow preload bridge; they do not own controllers.

This `open` fragment uses outer bounds, matching `BrowserWindow`'s default sizing and `getBounds()`. `PRELOAD` is your absolute preload path; `DEV_ENTRY` is your complete development page URL; `HTML_ENTRY` is your packaged HTML path. `watchWindow` is application-owned: it installs the coordinated `close` handler and forwards `closed` to the adapter's synchronous subscriber set, deleting the native map entry then.

```ts
import { app, BrowserWindow } from "electron"
import type { WindowRecord } from "@/lib/window-set"

const nativeWindows = new Map<string, BrowserWindow>()

async function openWindow(id: string, _url: string, record: WindowRecord) {
  const existing = nativeWindows.get(id)
  if (existing) {
    if (record.bounds) existing.setBounds(record.bounds)
    return // The initial main window was registered and watched at startup.
  }
  const win = new BrowserWindow({
    ...record.bounds,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  })
  nativeWindows.set(id, win)
  watchWindow(id, win)
  const query = { window: id, layout: record.layoutId }
  try {
    if (app.isPackaged) {
      await win.loadFile(HTML_ENTRY, { query })
    } else {
      const entry = new URL(DEV_ENTRY)
      for (const [key, value] of Object.entries(query)) entry.searchParams.set(key, value)
      await win.loadURL(entry.href)
    }
  } catch (error) {
    win.destroy()
    throw error
  }
}
```

Use [`loadURL`](https://www.electronjs.org/docs/latest/api/browser-window#winloadurlurl-options) with a full URL, or `loadFile` with a file path and query options. Do not pass `defaultWindowUrl` directly to `loadURL`. This adapter uses the record to construct its entry point and ignores that relative URL argument.

For `adapter.close`, obtain application approval and flush that window's data first. Reject cancellation. Attach a `closed` waiter before `win.destroy()` and resolve only when it fires; return immediately only if the window is already gone. [`destroy()`](https://www.electronjs.org/docs/latest/api/browser-window#windestroy) skips close and unload vetoes, so all prompts belong in the coordinator. A `win.close()` call can be canceled and does not confirm destruction. For `bounds`, return `nativeWindows.get(id)?.getBounds() ?? null`.

Expose specific operations and strip Electron's event object in preload. The application must type `window.shell`, validate IPC senders and arguments, and route `desk:open` and `desk:close` to the single owner. A `main` close request uses the desk quit flow.

```ts
// preload.ts
import { contextBridge, ipcRenderer } from "electron"
import type { WindowRecord } from "@/lib/window-set"

contextBridge.exposeInMainWorld("shell", {
  openWindow: (record: WindowRecord) => ipcRenderer.invoke("desk:open", record),
  closeWindow: (id: string) => ipcRenderer.invoke("desk:close", id),
  sendLink: (message: unknown) => ipcRenderer.send("link", message),
  onLink: (receive: (message: unknown) => void) => {
    const listener = (_event: unknown, message: unknown) => receive(message)
    ipcRenderer.on("link", listener)
    return () => { ipcRenderer.off("link", listener) }
  },
})
```

```ts
// main.ts: relay validated link messages among the desk's registered windows.
import { ipcMain } from "electron"
import { isLinkMessage } from "@/lib/link-group"

ipcMain.on("link", (event, message) => {
  const windows = [...nativeWindows.values()]
  if (!windows.some((win) => win.webContents === event.sender) || !isLinkMessage(message)) return
  for (const win of windows) if (win.webContents !== event.sender) win.webContents.send("link", message)
})
```

Each renderer builds `createCallbackTransport({ send: window.shell.sendLink, receive: window.shell.onLink })` before mounting its provider. The relay supplies broadcast behavior; the transport supplies subscription and message validation. Layout and preference synchronization need their own application messages.

## Launch and quit

Read preferences before mounting the initial workspace. Normalize the saved desk to your reserved `main` id and mark only that record `main: true`; add a default record if it is missing. The initial renderer must receive that record's `layoutId`, including when adopting an already-open window. Validate native label rules and adjust saved geometry before restore.

The following is application pseudocode. `lifecycle` implements the native requirements above; `normalizeDesk`, `loadPreferences`, and `mountMain` are yours. In Tauri, run this bootstrap only in the webview whose native label is `main`. In Electron, run it once in the main process and deliver the chosen record to the initial renderer.

```ts
let prefs = await loadPreferences()
const stored = readWindowSet(prefs) ?? windowSetOf([{ id: "main", layoutId: "desk", main: true }])
const desk = normalizeDesk(stored)
await lifecycle.registerInitialWindow("main")
const windows = createWindowSet(lifecycle.adapter)
await windows.restore(desk)
await mountMain(desk.windows.find((record) => record.id === "main")!)
```

`main: true` changes restore order. It does not implement whole-desk shutdown. Intercept quit before any window is destroyed, stop new window operations, and wait for operations already in flight. Collect approval and flush layout/preference writes from every renderer, snapshot while all windows still exist, then await durable storage. Only after that should the host close secondaries and the owner last. Do not use `closeAll()` from a Tauri owner webview: its insertion order can close the owner first.

```ts
// Application pseudocode, called once for each accepted quit attempt.
await lifecycle.pauseAndDrain()
try {
  await lifecycle.approveAndFlushAll() // Rejects if any window cancels.
  const next = writeWindowSet(prefs, await windows.snapshot())
  await persistPreferences(next) // Resolves after durable storage, not just an in-memory update.
  prefs = next
  await lifecycle.finishQuit() // Host closes approved windows; owner last.
} catch (error) {
  lifecycle.resume()
  reportError(error)
}
```

In Electron, handle [`before-quit`](https://www.electronjs.org/docs/latest/api/app#event-before-quit) with `event.preventDefault()` synchronously, then run this sequence under a reentry guard. The final host step can destroy approved windows and call `app.quit()` with the guard released for that final pass. Route the main window's `close` event through the same sequence. In Tauri, prevent the initial main close request and Rust [`RunEvent::ExitRequested`](https://docs.rs/tauri/latest/tauri/enum.RunEvent.html); the host resumes exit only after the owner's persistence acknowledgment. A quit hook cannot guarantee saving through crashes or forced OS termination, so also persist during normal use.

Window-set `boundaries` describe intended ownership; they do not filter fields. A preferences export selects whole slots. Marking the `windows` slot as `template` exports its saved `bounds` and `display` too. To share only window ids, layout ids, and the main flag, remove geometry from a copy before writing the template slot.

## What stays yours

The shell, security policy, layouts, storage, sign-in, and failure recovery belong to the application. Verify native creation failure, close cancellation, X-button closure, quit persistence, secondary-window startup, and monitor scaling in the shells and operating systems you ship. The library's window-set tests use fake adapters; they do not exercise these native integrations.
