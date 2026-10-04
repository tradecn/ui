# Workspace

Dock, tab, float, and pop out panels with dockview. Each panel keeps its kind, title, and JSON state; you save and restore the layout.

## Usage

```tsx
import { PanelContent } from "@/components/ui/panel"
import { Workspace, WorkspaceTab, WorkspaceTabClose, WorkspaceTabTitle } from "@/components/ui/workspace"

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
      tabComponent={DeskTab}
      watermark="No panels."
      seed={(api) => {
        const orders = api.addPanel({ kind: "orders", title: "Orders" })
        api.addPanel({ kind: "positions", title: "Positions", position: { reference: orders, direction: "right" } })
      }}
    />
  )
}

export function DeskTab() {
  return (
    <WorkspaceTab>
      <WorkspaceTabTitle />
      <WorkspaceTabClose>×</WorkspaceTabClose>
    </WorkspaceTab>
  )
}
```

Pass a `tabComponent` to arrange tab contents. Omitting it keeps the same title-and-close composition. Save this example as an application `workspace.tsx` outside `components/ui`; the examples below import its `DeskTab` export.

Keep `panels` stable with a module constant or `useMemo`; replacing it re-renders every panel. Define `tabComponent` outside render so its local state survives parent updates. Give the workspace a height and let it fill the available width. `workspace.tsx` imports dockview's stylesheet.

## Composition

```text
Workspace
├── WorkspaceTab
│   ├── WorkspaceTabTitle
│   ├── WorkspaceTabClose
│   └── WorkspaceTabActions
└── Panel
    ├── PanelHeader
    │   ├── SymbolTag
    │   ├── LinkGroupDot
    │   └── PanelActions
    └── PanelContent
```

`Workspace` supplies the `Panel` wrapper. Your registered component renders its header and content and calls `useWorkspacePanel()` for state and actions.

## Tab controls

Use `WorkspaceTabActions` for inputs and menus that keep their own focus. `useWorkspaceTab` reads the same saved state as the panel body. This layout places a menu before the title and a symbol field after it; overflow entries omit the field.

Install shadcn `dropdown-menu` alongside Workspace before copying this example. The example is self-contained. For menus in separate windows, see the [popout portal limits](#floating-popout-maximize).

<!-- demo: workspace-tab-controls -->

## Saved layouts

Use `defaultLayout` to restore the dock arrangement and saved panel state. This example saves to browser storage and imports `DeskTab` from the [Usage](#usage) file.

Mount this example on the client; it reads `localStorage`. Drag tabs to an edge to split panels, or onto another tab to combine them. After editing a symbol or arrangement, wait for the save count to increase before reloading. See [Saving is yours](#saving-is-yours) for debounce and page-close limits.

<!-- demo: workspace-saved-layout -->

## Linked panels

Put panels in the same link group to share a symbol. This example accepts `ZN`, `ZB`, and `ES` and imports `DeskTab` from the [Usage](#usage) file.

`useWorkspacePanel` supplies each panel's identity and starting state. `useLinkGroup` handles live updates and writes symbol and group changes back to that state. `transport={null}` keeps this example's links within its provider; omit it to use the default cross-window channel.

<!-- demo: workspace-linked-panels -->

## Keyboard actions

Bind application commands through `HotkeysProvider`. Here, `r` refreshes the focused panel, `]` and `[` change panels, `n q` adds one, and `w` closes it. Copy `DeskTab` from the [Usage](#usage) file first.

Declare bindings on `HotkeysProvider`, then attach handlers with `useHotkey`. Workspace supplies each panel's `panel:quotes` scope, so the two instances share a binding without sharing its handler. The global handlers use the API received by `onReady`.

<!-- demo: workspace-keyboard -->

## Panel actions

Use the panel handle to float, pop out, or maximize a panel. Its local note survives these moves; resetting the layout creates fresh panels. This example imports `DeskTab` from the [Usage](#usage) file.

Serve an empty same-origin `/popout.html` page, such as `public/popout.html` in Vite, before using Pop out. The preview supplies this file. See [Floating, popout, maximize](#floating-popout-maximize) for window, styling, and restoration limits.

<!-- demo: workspace-panel-actions -->

## API Reference

### Workspace

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `panels` | [Panel components](#panels-by-kind) | Required | Components indexed by panel kind. |
| `tabComponent` | `ComponentType` | Title and close | Contents of each tab, including overflow entries. |
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
| Other div props | `ComponentProps<"div">` | None | Forwarded to the wrapper, except `children`. Includes the outer div `ref`. |

### Tab parts

Import tab parts and `useWorkspaceTab` from `@/components/ui/workspace`. Render them inside the component passed to `tabComponent`.

| Part | Element | Purpose |
|---|---|---|
| `WorkspaceTab` | `div` | Required `children`; clicking focuses the panel unless `onClick` calls `preventDefault()`. |
| `WorkspaceTabTitle` | `span` | Current dock title; accepts no children. |
| `WorkspaceTabClose` | `button` | Required `children`; closes the panel unless `onClick` calls `preventDefault()`. Defaults to `type="button"` and the name `Close <title>`. |
| `WorkspaceTabActions` | `div` | Required `children`; prevents nested controls from activating, focusing, or dragging the tab. |

Each part accepts its native props, ref and class name. An explicit `aria-label` or `aria-labelledby` replaces the close button's generated name. Wrap custom inputs and menu triggers in `WorkspaceTabActions`; child handlers run before its bubbling event guards. A plain `WorkspaceTabClose` preserves the default tab's pointer activation before closing. Put it inside Actions to keep an inactive panel inactive.

Actions stops contained pointer-down, mouse-down, touch-start, click and drag-start events before they reach the dock. Document and window bubble listeners also miss those events; capture listeners still receive them. Clicking a header action leaves an existing dock overflow popup open.

In overflow, Actions also stops pointer-down, mouse-down, touch-start and click events from portaled content. It stops Enter bubbling, and stops Escape when a control has prevented it or it comes from a portal. An unhandled Escape from an ordinary overflow control can close the dock popup.

Dockview owns the outer `role="tab"`, its id, roving focus, selection and tabpanel association. `WorkspaceTab` props and ref address the inner div. Rename the actual tab with `setTitle`; an `aria-label` on that inner div does not rename the outer tab. Ordinary title and close parts subscribe only to title changes.

Roving focus applies to the outer tabs. Close buttons and controls inside `WorkspaceTabActions` keep their native Tab stops, including on inactive tabs; Actions isolates events, not keyboard navigation. For the [APG tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), where Tab leaves the tablist from its active tab, omit inline controls and put panel actions or fields in `PanelHeader` or the panel body.

### useWorkspaceTab

The hook returns `WorkspaceTabHandle`: the [panel handle](#panels-by-kind), plus `focus(): void` and `tabLocation: "header" | "headerOverflow"`. `focus()` activates the panel and moves focus into its registered workspace body. The hook subscribes to this panel's record, title, activity and location; static tab markup needs no hook.

Create panels with `WorkspaceApi.addPanel` to register their kind, saved state and body. A panel added directly through the raw Dockview API has no workspace record: `kind` and `state` are `undefined`, `setTitle` and `setState` do nothing, and a state updater is not called. Its `focus()` activates the panel but does not move keyboard focus into a body. Dock readings and close, float, popout and maximize commands still work; use the raw panel's `api.setTitle` to rename it.

A panel can have header and overflow renderers mounted at once. Use `useId()` for control/label ids, and keep shared values in panel state. Component-local state belongs to each rendered tab and resets when that instance unmounts. Closing overflow disposes its renderers, subscriptions and consumer effects. For managed panels, use `setTitle` to keep the record, dock, tab name and overflow title synchronized; a direct raw Dockview title write is overwritten by the next workspace store write.

In Dockview 8.3.1, removing a panel leaves an empty overflow row until the popup closes. A standalone `WorkspaceTabClose` lets the native row dismiss the popup. Use Space to activate that button in overflow. Dockview handles Enter by dismissing the popup before the button can act.

### Panels by kind

`panels` is a `Record<string, ComponentType<WorkspacePanelProps>>`, indexed by kind. Each panel is a `region` named by its title, with hotkey scope `panel:<kind>` and an active border controlled by the dock. Registered components receive `id` and `kind` as string props. Inside them, `useWorkspacePanel()` returns:

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

Drag panels by their tabs. `PanelHeader` holds controls but is not a workspace drag handle. The default tab shows the title and a close button. No tab context menu is enabled; use your shadcn `context-menu` or configure dockview's own menu through `api.dockview`.

An unregistered kind renders a placeholder and uses the same tab component, so older layouts still open. The default tab retains its close button. `unknownPanelKinds(layout, Object.keys(PANELS))` lists missing kinds up front. Import it from `@/lib/workspace-layout`.

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

`focusPanel(id)` activates the panel and moves keyboard focus inside it; clicking ordinary header tab contents does the same. Its `panel:<kind>` bindings can then answer. Use `focusNext()` or `focusNext(-1)` to move in dockview's order, and bind `addPanel` or `closePanel` as needed. Dockview's optional enterprise keymap is not enabled; the registry supplies the binding list for your palette or help overlay.

For newly created panels, `addPanel`'s default `focus: true` waits for the panel to render. Explicit focus calls in `onReady` or a child's first layout effect can activate a panel before its body has registered a focus target.

When the outer tab itself has focus, arrows and Home/End move focus without selecting; Enter/Space select, and Delete/Backspace close and focus a neighbor. Nested controls keep their own keys. Closing with the ordinary close button or selecting the already-active panel from overflow can leave focus on the document body. Omitting a close button does not disable keyboard or API closing. Dockview 8.3.1's overflow opener is not a keyboard button; tab composition does not replace that control.

### Floating, popout, maximize

`api.float(id)` creates a floating group over the workspace. Shift-dragging a tab does the same unless `disableFloating` is set; direct `float` calls and `addPanel({ floating: true, ... })` remain available. `api.toggleMaximize(id)` maximizes or restores the panel's group, only while it is in the grid.

`locked` disables grid splitter resizing. To also stop drag and drop, use `api.dockview.updateOptions({ disableDnd: true })`. See dockview's [locking behavior](https://dockview.dev/docs/core/locked/).

`api.popout(id)` opens a separate window in the same JavaScript context: one React tree and shared stores, as with `PanelPopout`. Link groups need no transport between the main page and its popouts. Dockview copies stylesheets when the window loads; the workspace attaches an available hotkey registry and mirrors root-element attributes, including theme-class changes.

Popouts have the same limits as `PanelPopout`: components that portal to the main `document.body` open there, and later stylesheet changes are not copied. Separate JavaScript contexts need the desktop-shell approach below.

Serve an empty same-origin page at `/popout.html` (`public/popout.html` in Vite), or set `popoutUrl`. Call `popout()` from a click or key press. It resolves to `false` if the panel is missing or the browser blocks the window. Closing the window returns its panels to the main workspace; a panel popped out from a floating group can return there.

Saved popouts are reopened during restoration, often without a user gesture. If blocked, dockview returns their panels to the grid and logs an error to the console. Close popouts before saving a reusable template.

### One window per JavaScript context

For a desktop shell with separate webviews, mount one `Workspace` per window, each with its own stores and layout saved under its record's `layoutId` — several windows can share one layout; see [Desktop shells](shells.md) and [`window-set`](window-set.md), which provides the window tracking. The shell opens new windows itself; omit workspace `popout` actions.

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

Dock overlays start at z-index `30`; floating groups increase that value, and their overflow popups use twice the group's value. The tab-controls example adds `isolate` to `Workspace`, keeping those native layers in the workspace's stacking context while its portaled menus render above them. Use the same setup when composing tab menus, and choose the workspace's position in your application's layers.

Set `--dv-overlay-z-index` on `.dockview-theme-tradecn` to change the base. The floating-container rule replaces Dockview's self-referencing declaration with the root value. Optional tab-group colors configured through `api.dockview` use `--chart-1` through `--chart-5`, with grey using `--muted-foreground`. Installation also adds `panel-active`, `panel-drag-target`, `panel-error`, `panel-sync`, and `link-1` through `link-4` if missing, with the mono font token, the accessible pair, and the hyperlegible remap.

### The dock's own API

`onReady` and `seed` receive a `WorkspaceApi`:

| Method | Returns | Purpose |
|---|---|---|
| `addPanel(options)` | `string` | Adds or focuses a panel; see the options above. |
| `closePanel(id)` | `void` | Closes the panel and removes its saved record. |
| `focusPanel(id)` | `void` | Activates and focuses the panel. |
| `focusNext(step = 1)` | `void` | Moves forward (`1`) or backward (`-1`). |
| `panels()` | `WorkspacePanelInfo[]` | Lists each panel's `id`, `kind`, `title`, `active`, and `location`. Raw panels are not listed. |
| `activePanel()` | `string \| null` | Returns the active id, a raw panel's included, or `null`. |
| `getState(id)` | `WorkspacePanelState \| undefined` | Reads a panel's state. |
| `setTitle(id, title)` | `void` | Updates a nonempty title. |
| `setState(id, patch)` | `void` | Applies the same patch or updater accepted by the panel handle. |
| `float(id, box?)` | `void` | Moves a panel into a floating group. |
| `popout(id)` | `Promise<boolean>` | Opens a popout. |
| `toggleMaximize(id)` | `void` | Maximizes or restores the panel's grid group. |
| `toLayout()` | `WorkspaceLayout` | Takes a layout snapshot immediately. |
| `load(layout: unknown)` | `boolean` | Replaces the workspace; failure leaves it empty. |
| `clear()` | `void` | Removes all panels. |

`api.dockview` exposes `DockviewApi` from `dockview-react` for features outside this wrapper. Its layout changes still schedule saves. Create every persisted panel with `WorkspaceApi.addPanel`: a raw panel has no workspace record, but still appears in `toLayout()`'s dock tree. That incomplete layout fails `parseWorkspaceLayout` and cannot be restored; `load` clears the workspace and reports failure. Raw panels need application-owned persistence.

`Workspace` owns the dock's lifetime. Unmount it to dispose the dock and its subscriptions; do not call `api.dockview.dispose()` while the component remains mounted.

### The dependency

Dependency baseline: `dockview-react` 8.3.1, checked 2026-09-21. It brings `dockview` (a re-export) and `dockview-core`: three MIT packages from one repository, with no further runtime dependencies beyond React peers. Dockview supplies docking, tabs, floating groups, popouts, and JSON layouts. shadcn's `resizable` supplies resizable panels; a grid library supplies tiles rather than docking.

This item uses no `dockview-enterprise` features. The separately licensed package adds the keyboard keymap, drag compass, multi-row tabs, smart guides, and auto-hide/dock-to-edge behavior; basic edge groups are free. See the [feature and license comparison](https://dockview.dev/docs/overview/licence/).

If you already installed [`panel`](panel.md), both items reference the same shared source files. Local edits to installed files still need the usual update review.

### What it does not do

The workspace provides no storage backend, data fetching, or close confirmation. Closing a tab also discards any unsaved draft held by that panel. Minimum panel sizes, tab context menus, and dockview's own keyboard navigation are not exposed as workspace props; configure them through `api.dockview` where supported.
