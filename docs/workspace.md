# Workspace

Dock, tab, float, and pop out panels with dockview. Each panel keeps its kind, title, and JSON state; you save and restore the layout.

## Usage

```tsx
import { PanelContent } from "@/components/ui/panel"
import { Workspace } from "@/components/ui/workspace"

function Orders() {
  return <PanelContent className="p-3">No open orders.</PanelContent>
}

function Positions() {
  return <PanelContent className="p-3">No positions.</PanelContent>
}

const PANELS = { orders: Orders, positions: Positions }

export default function WorkspaceDemo() {
  return (
    <Workspace
      className="h-64 rounded-md border border-border"
      panels={PANELS}
      watermark="No panels."
      seed={(api) => {
        const orders = api.addPanel({ kind: "orders", title: "Orders" })
        api.addPanel({ kind: "positions", title: "Positions", position: { reference: orders, direction: "right" } })
      }}
    />
  )
}
```

Drag either tab beside the other panel to split the space, or onto its tab strip to combine them. The close button removes a panel.

Keep `panels` stable with a module constant or `useMemo`; replacing it re-renders every panel. Give the workspace a height and let it fill the available width. `workspace.tsx` imports dockview's stylesheet.

## Composition

```text
Workspace
└── Panel
    ├── PanelHeader
    │   ├── SymbolTag
    │   ├── LinkGroupDot
    │   └── PanelActions
    └── PanelContent
```

`Workspace` supplies the `Panel` wrapper. Your registered component renders its header and content and calls `useWorkspacePanel()` for state and actions.

## Saved layouts

Use `defaultLayout` to restore the dock arrangement and each panel's JSON state. Here, changing a starting symbol, moving a tab, or closing a panel saves to browser storage. Wait for the save count to increase, then reload the page to restore it. Reset layout puts both panels and their initial symbols back.

This example reads `localStorage`, so mount it on the client. The save callback runs after changes settle; see [Saving is yours](#saving-is-yours) for debounce and page-close limits.

<!-- demo: workspace-saved-layout -->

## Linked panels

Put panels in the same link group to share a symbol. Edit either symbol to `ZN`, `ZB`, or `ES` and press Enter; both panels follow. Shift-click a group numbered 1 to unlink that panel, then change its symbol independently.

`useWorkspacePanel` supplies each panel's identity and starting state. `useLinkGroup` handles live updates and writes symbol and group changes back to that state. `transport={null}` keeps this example's links within its provider; omit it to use the default cross-window channel.

<!-- demo: workspace-linked-panels -->

## Keyboard actions

Click a tab to focus its panel. Press `r` to increment that panel's refresh-request counter, `]` or `[` to focus the next or previous panel, `n` then `q` to add one, and `w` to close the active panel. Refresh is a local counter here; a real handler would request quotes from your feed.

Declare bindings on `HotkeysProvider`, then attach handlers with `useHotkey`. Workspace supplies each panel's `panel:quotes` scope, so the two instances share a binding without sharing its handler. The global handlers use the API received by `onReady`.

<!-- demo: workspace-keyboard -->

## Panel actions

Float moves a panel over the dock. Pop out moves it into a separate window; closing that window returns it. Maximize / restore expands a docked group and puts it back. Type a note before moving a panel to see its React state survive; Reset layout creates fresh panels.

Serve an empty same-origin `/popout.html` page, such as `public/popout.html` in Vite, before using Pop out. The preview supplies this file. See [Floating, popout, maximize](#floating-popout-maximize) for window, styling, and restoration limits.

<!-- demo: workspace-panel-actions -->

## API Reference

### Workspace

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `panels` | `Record<string, ComponentType<WorkspacePanelProps>>` | Required | Components indexed by panel kind. |
| `defaultLayout` | `unknown` | None | Layout object or JSON text to restore at initialization. Use `api.load` for later changes. |
| `seed` | `(api: WorkspaceApi) => void` | None | Builds the initial layout when none can be restored. |
| `onReady` | `(api: WorkspaceApi) => void` | None | Receives the API after the initial load or seed call returns. |
| `onLayoutChange` | `(layout: WorkspaceLayout) => void` | None | Receives layouts for you to save. |
| `layoutChangeDelay` | `number` | `250` | Debounce interval in milliseconds, captured at initialization. |
| `onLayoutError` | `(reason: unknown) => void` | None | Receives load failures and synchronous errors while producing or saving a layout. |
| `watermark` | `ReactNode` | `null` | Content shown when the main grid has no visible groups, including when all panels float or pop out. |
| `locked` | `boolean` | `false` | Disables resizing with grid splitters. |
| `disableFloating` | `boolean` | `false` | Disables the Shift-drag gesture for floating. |
| `popoutUrl` | `string` | `"/popout.html"` | Same-origin page served for popouts. |
| `className` | `string` | None | Styles the outer wrapper; give the workspace a height. |
| Other div props | `ComponentProps<"div">` | None | Forwarded to the wrapper, except `children` and `ref`. |

### Panels by kind

Each panel is a `region` named by its title, with hotkey scope `panel:<kind>` and an active border controlled by the dock. Registered components receive `id` and `kind` as string props. Inside them, `useWorkspacePanel()` returns:

| Member | Type | Purpose |
|---|---|---|
| `id`, `kind`, `title` | `string` | Identity, registered kind, and display title. |
| `state` | `WorkspacePanelState` | The panel's saved JSON object. |
| `active` | `boolean` | Whether this is the dock's active panel. |
| `location` | `"grid" \| "floating" \| "popout" \| "edge"` | Current location; edge groups require direct dockview API use. |
| `setTitle` | `(title: string) => void` | Updates the title; ignores empty strings. |
| `setState` | `(patch: WorkspacePanelStatePatch \| ((state: WorkspacePanelState) => WorkspacePanelStatePatch)) => void` | Merges a state patch. |
| `close`, `toggleMaximize` | `() => void` | Close this panel, or maximize/restore its grid group. |
| `float` | `(box?: WorkspaceBox) => void` | Moves this panel into a floating group. |
| `popout` | `() => Promise<boolean>` | Opens a popout; see the window requirements below. |

Mount `LinkGroupProvider` for [linked symbols](#linked-panels) and `HotkeysProvider` for [keyboard actions](#keyboard-actions). Neither provider is needed for basic docking. See [`panel`](panel.md) for header composition and [`use-hotkeys`](use-hotkeys.md) for binding behavior.

Drag panels by their tabs. `PanelHeader` holds controls but is not a workspace drag handle. Tabs show the title and a close button. No tab context menu is enabled; use your shadcn `context-menu` or configure dockview's own menu through `api.dockview`.

An unregistered kind renders a placeholder with a working close button, so older layouts still open. `unknownPanelKinds(layout, Object.keys(PANELS))` lists missing kinds up front. Import it from `@/lib/workspace-layout`.

### Adding panels

`api.addPanel(options)` returns the panel id. If that id is already open, it focuses the existing panel and leaves its title and state unchanged.

| Option | Type | Default | Purpose |
|---|---|---|---|
| `kind` | `string` | Required | Selects the registered component. |
| `id` | `string` | Lowest free `<kind>-N`, starting at 1 | Identifies the panel. |
| `title` | `string` | `kind` | Names the panel and tab. |
| `state` | `WorkspacePanelState` | `{}` | Initial JSON state. |
| `position` | `{ reference?: string; direction: "left" \| "right" \| "above" \| "below" \| "within" }` | Active group | Places the panel beside a reference panel, or tabs it with `within`. |
| `floating` | `boolean \| WorkspaceBox` | `false` | Opens floating; takes precedence over `position`. |
| `focus` | `boolean` | `true` | Moves keyboard focus into the new panel after rendering. |

`WorkspaceBox` has optional numeric `x`, `y`, `width`, and `height` fields in CSS pixels. Omitted fields use dockview's defaults: position `(100, 100)`, size `300 × 300` in 8.3.1.

### What a panel keeps

Keep small settings in `state`: a symbol, link group, or view option. `WorkspacePanelState` is a string-keyed object of JSON values; `WorkspacePanelStatePatch` also accepts `undefined` to remove a key. `setState` shallow-merges a patch or a patch returned from a function of the previous state. An identical serialized result triggers no store update or save.

Runtime values are cleaned through JSON serialization. Function-valued object properties disappear, dates become strings, and an unserializable object becomes `{}`. These non-JSON values are outside the declared input type.

In [Linked panels](#linked-panels), `useLinkGroup` treats the starting symbol as a seed. A real group write, including one from another window, takes precedence.

### The layout, and what it leaves out

`onLayoutChange` receives a `WorkspaceLayout`:

```ts
{
  version: 1,
  kind: "tradecn-workspace",
  dockview: { ... }, // Arrangement, including floating and popout positions.
  panels: { "book-1": { kind: "book", title: "Order book", state: { symbol: "ZN", group: 1 } }, ... },
  boundaries: WORKSPACE_PERSISTENCE_BOUNDARIES,
}
```

Read panel records from `panels`. Treat `dockview` as opaque data owned by the installed dockview version. Layout types, `parseWorkspaceLayout`, and `WORKSPACE_PERSISTENCE_BOUNDARIES` are exported from `@/lib/workspace-layout`.

The payload records these persistence boundaries so saved templates can travel between workspaces:

| Boundary | Contents | Storage |
|---|---|---|
| `autosave` | Dock arrangement, floating/popout positions, panel kinds, titles, and state. | Included in the layout. |
| `workspaceScoped` | Column widths and sort, selection, scroll position, ticket drafts. | Store separately by panel id if needed. |
| `globalScoped` | Hotkey remaps, palette recents, theme, instrument conventions. | Store as the person's preferences. |
| `excluded` | Market data, orders and status, positions, feed health, live link-group symbols. | Keep out of saved state. |

These boundaries document a policy; they do not filter panel state. You must keep session data out of `state` to make a layout portable. A panel's saved symbol is a starting value, separate from a link group's live symbol.

`parseWorkspaceLayout(value)` accepts an object or JSON text and returns a copy, or `null`. It checks the version-1 envelope and basic dock structure, requires a nonempty kind for every panel, drops orphan records, defaults missing or empty titles to the kind, and cleans state. Valid recorded boundaries are preserved; missing or malformed boundaries use the current defaults. It does not fully validate dockview's internal layout. Only version 1 is currently supported.

Both `defaultLayout` and `api.load` use this parser. If parsing fails or dockview refuses the layout, `api.load` clears the workspace, calls `onLayoutError`, and returns `false`. At initialization, a missing or failed layout falls back to `seed(api)`; later `api.load` calls do not seed.

### Saving is yours

`onLayoutChange` runs after changes stop for `layoutChangeDelay` milliseconds. Resize drags can report on every pointer move. Seeding schedules a save; a successful synchronous restore establishes the saved baseline, and unchanged snapshots do not save again. Delayed popout restoration can produce further changes.

Unmounting flushes a pending callback before disposing the dock. This does not guarantee a write when a page closes: page unload need not unmount React, and asynchronous writes are not awaited. Choose storage in your callback: `localStorage`, a desktop file, or a server. `onLayoutError` receives synchronous serialization or callback errors; handle rejected asynchronous writes yourself.

### Keys

Receive the API through `onReady` and bind its actions through the hotkey registry. The workspace declares no bindings:

```ts
const BINDINGS: HotkeyBinding[] = [
  { id: "workspace.next", keys: "]", scope: "global", description: "Next panel" },
  { id: "workspace.previous", keys: "[", scope: "global", description: "Previous panel" },
  { id: "workspace.book", keys: "n b", scope: "global", description: "New book" },
]
useHotkey("workspace.next", () => api.focusNext())
```

`focusPanel(id)` activates the panel and moves keyboard focus inside it; clicking a tab does the same. Its `panel:<kind>` bindings can then answer. Use `focusNext()` or `focusNext(-1)` to move in dockview's order, and bind `addPanel` or `closePanel` as needed. Dockview's optional enterprise keymap is not enabled; the registry supplies the binding list for your palette or help overlay.

### Floating, popout, maximize

`api.float(id)` creates a floating group over the workspace. Shift-dragging a tab does the same unless `disableFloating` is set; direct `float` calls and `addPanel({ floating: true, ... })` remain available. `api.toggleMaximize(id)` maximizes or restores the panel's group, only while it is in the grid.

`locked` disables grid splitter resizing. To also stop drag and drop, use `api.dockview.updateOptions({ disableDnd: true })`. See dockview's [locking behavior](https://dockview.dev/docs/core/locked/).

`api.popout(id)` opens a separate window in the same JavaScript context: one React tree and shared stores, as with `PanelPopout`. Link groups need no transport between the main page and its popouts. Dockview copies stylesheets when the window loads; the workspace attaches an available hotkey registry and mirrors root-element attributes, including theme-class changes.

Popouts have the same limits as `PanelPopout`: components that portal to the main `document.body` open there, and later stylesheet changes are not copied. Separate JavaScript contexts need the desktop-shell approach below.

Serve an empty same-origin page at `/popout.html` (`public/popout.html` in Vite), or set `popoutUrl`. Call `popout()` from a click or key press. It resolves to `false` if the panel is missing or the browser blocks the window. Closing the window returns its panels to the main workspace; a panel popped out from a floating group can return there.

Saved popouts are reopened during restoration, often without a user gesture. If blocked, dockview returns their panels to the grid and logs an error to the console. Close popouts before saving a reusable template.

### One window per JavaScript context

For a desktop shell with separate webviews, mount one `Workspace` per window, each with its own stores and layout saved under the window id. The shell tracks windows and their layouts and opens new windows itself; omit workspace `popout` actions.

Connect link groups through a `LinkTransport` built with `createCallbackTransport` and the shell's events (see [`panel`](panel.md)). Mount a `HotkeysProvider` in each window.

### The theme

The registry appends `.dockview-theme-tradecn` to your stylesheet, mapping dockview variables to your shadcn tokens:

| Dock surface | Token |
|---|---|
| Group background | `--background` |
| Tab strip | `--muted` |
| Tab text | `--foreground`, `--muted-foreground` |
| Separators | `--border` |
| Active splitter and drop indicator | `--ring` |
| Dropdown radius | `--radius` |

These mappings follow light, dark, and tradecn themes. `scripts/workspace-theme.test.ts` checks coverage against the installed dockview light theme, including variables added by upgrades.

Dock overlays use z-index `30`, below shadcn menus and dialogs at `50`. Optional tab-group colors configured through `api.dockview` use `--chart-1` through `--chart-5`, with grey using `--muted-foreground`. Installation also adds `panel-active`, `panel-drag-target`, `panel-error`, `panel-sync`, and `link-1` through `link-4` if missing.

### The dock's own API

`onReady` and `seed` receive a `WorkspaceApi`:

| Method | Returns | Purpose |
|---|---|---|
| `addPanel(options)` | `string` | Adds or focuses a panel; see the options above. |
| `closePanel(id)` | `void` | Closes the panel and removes its saved record. |
| `focusPanel(id)` | `void` | Activates and focuses the panel. |
| `focusNext(step = 1)` | `void` | Moves forward (`1`) or backward (`-1`). |
| `panels()` | `WorkspacePanelInfo[]` | Lists each panel's `id`, `kind`, `title`, `active`, and `location`. |
| `activePanel()` | `string \| null` | Returns the active id, or `null`. |
| `getState(id)` | `WorkspacePanelState \| undefined` | Reads a panel's state. |
| `setTitle(id, title)` | `void` | Updates a nonempty title. |
| `setState(id, patch)` | `void` | Applies the same patch or updater accepted by the panel handle. |
| `float(id, box?)` | `void` | Moves a panel into a floating group. |
| `popout(id)` | `Promise<boolean>` | Opens a popout. |
| `toggleMaximize(id)` | `void` | Maximizes or restores the panel's grid group. |
| `toLayout()` | `WorkspaceLayout` | Takes a layout snapshot immediately. |
| `load(layout: unknown)` | `boolean` | Replaces the workspace; failure leaves it empty. |
| `clear()` | `void` | Removes all panels. |

`api.dockview` exposes `DockviewApi` from `dockview-react` for features outside this wrapper. Its layout changes still schedule saves. Panels added directly with a different component name have no workspace record and are outside this item's persistence contract.

### The dependency

Dependency baseline: `dockview-react` 8.3.1, checked 2026-09-21. It brings `dockview` (a re-export) and `dockview-core`: three MIT packages from one repository, with no further runtime dependencies beyond React peers. Dockview supplies docking, tabs, floating groups, popouts, and JSON layouts. shadcn's `resizable` supplies resizable panels; a grid library supplies tiles rather than docking.

This item uses no `dockview-enterprise` features. The separately licensed package adds the keyboard keymap, drag compass, multi-row tabs, smart guides, and auto-hide/dock-to-edge behavior; basic edge groups are free. See the [feature and license comparison](https://dockview.dev/docs/overview/licence/).

If you already installed [`panel`](panel.md), both items reference the same shared source files. Local edits to installed files still need the usual update review.

### What it does not do

The workspace provides no storage backend, data fetching, or close confirmation. Closing a tab also discards any unsaved draft held by that panel. Minimum panel sizes, tab context menus, and dockview's own keyboard navigation are not exposed as workspace props; configure them through `api.dockview` where supported.
