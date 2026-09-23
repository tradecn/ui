# Panel

Frame a book, chart, or blotter with a header and hotkey scope. Add symbol editing, link groups, and a popout as needed.

## Usage

```tsx
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/panel"

export default function PanelDemo() {
  return (
    <Panel kind="orders" className="h-40 w-72 max-w-full">
      <PanelHeader>
        <PanelTitle>Orders</PanelTitle>
      </PanelHeader>
      <PanelContent className="p-3 text-sm">No open orders.</PanelContent>
    </Panel>
  )
}
```

Give the panel a height; `PanelContent` fills what the header leaves and scrolls overflow. `PanelTitle` also names the region for assistive technology. Basic framing needs no provider.

## Composition

```text
Panel
├── PanelHeader
│   ├── PanelTitle
│   ├── SymbolTag
│   ├── LinkGroupDot
│   └── PanelActions
└── PanelContent
```

`PanelPopout` wraps the panel for a [popout](#popout). The header, title, actions, and content accept div props, including `children` and `className`. `PanelContent` fills the remaining height and scrolls overflow.

## Linked symbols

Book A and Book B start in group 1; Book C is unlinked. Edit either linked symbol to `ZN`, `ZB`, or `ES` and press Enter. Both linked books follow, while Book C keeps its own symbol. Invalid symbols stay open for correction; Escape cancels the edit.

Click a group dot to cycle forward, or Shift-click to go back. Joining group 1 adopts its symbol; leaving keeps the symbol currently displayed. `transport={null}` isolates this preview's provider. Omit it to use the default [cross-window channel](#between-windows).

<!-- demo: panel-linked -->

## Scoped hotkeys

Click Refresh in either book, then press `r`. Only that book's counter changes. You can also focus its button with Tab before pressing the key. The shared binding names the panel kind; each handler belongs to the instance that contains it.

Call `useHotkey` in a child of `Panel`, as `BookContent` does here. Calling it in the component that returns `Panel` puts the handler outside that panel's scope. The counters stand in for refresh requests; replace the handler with your application's action.

<!-- demo: panel-hotkeys -->

## Border states

By default, focus inside a panel activates its border. Focus the Note field to see it, or use the controls above the preview to force active or inactive. Drag target overrides active, and Error overrides both. The checkboxes can be combined to show that priority.

These controls set presentation props; they do not implement dragging or an error workflow. [The header is a drag handle](#the-header-is-a-drag-handle) explains the layout integration.

<!-- demo: panel-states -->

## Popout panel

Increment the counter, then pop it out. Its count survives the move, and `i` still increments it while focus is inside the panel. Bring it back from either window, or close the popout window itself. The panel fills the popout because it uses `h-full`.

`PanelPopout` moves one portal host between documents, preserving React state and provider context. Here, `HotkeysProvider` supplies the shortcut in both windows. [Popout](#popout) covers styling, lifecycle, and portal limitations.

<!-- demo: panel-popout -->

## API Reference

### A panel is a hotkey scope

| Panel prop | Type | Default | Purpose |
|---|---|---|---|
| `kind` | `string` | Required | Hotkey scope `panel:<kind>`, shared by panels of this kind. |
| `active` | `boolean` | Focus within | Controls the active border; `false` suppresses it even with focus inside. |
| `dragTarget` | `boolean` | `false` | Shows the drag target border and background. |
| `error` | `boolean` | `false` | Shows the error border. |
| `className` | `string` | None | Styles and sizes the panel. |
| Other div props | `Omit<ComponentProps<"div">, "ref">` | None | Includes `children`, event handlers, and accessible labels. |

Declare a binding once for `panel:book`; the handler under the focused book answers it. Clicking the panel aims the keyboard at it. Palette actions with that scope appear when opened from inside a book. `Panel` renders without `HotkeysProvider`, but hotkeys need the provider. See [`use-hotkeys`](use-hotkeys.md) for binding options.

`Panel` renders a `region` named by `PanelTitle`, or by an explicit `aria-label`. Border priority is `error`, then `dragTarget`, then active. `data-state` is `error`, `drag-target`, `active`, `inactive`, or `auto`; `auto` uses CSS focus-within.

### The header is a drag handle

Point your layout's handle selector at `[data-panel-handle]` on `PanelHeader`. The panel does not drag itself. `SymbolTag`, `LinkGroupDot`, and `PanelActions` stop `pointerdown`, `mousedown`, and `touchstart` from reaching the header. They do not stop `dragstart`; HTML drag and drop needs a separate handle beside these controls.

`PanelActions` aligns your buttons at the header's far end. Supply their icons; shadcn's icon library varies by base.

### SymbolTag

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `value` | `string \| null` | Required | Current symbol. |
| `onCommit` | `(symbol: string) => void` | Required | Receives an accepted, changed symbol; update `value` to display it. |
| `normalize` | `(raw: string) => string` | Trim and uppercase | Converts the draft before comparison and validation; override for case-sensitive symbols such as `BRK.b`. |
| `validate` | `(symbol: string) => boolean` | None | Returning `false` keeps the field open with `aria-invalid`. |
| `placeholder` | `string` | `"symbol"` | Text when `value` is `null`. |
| `editing` | `boolean` | Internal state | Controls edit mode, for example from a hotkey. |
| `onEditingChange` | `(editing: boolean) => void` | None | Receives requests to open or close the field. |
| `disabled` | `boolean` | `false` | Prevents editing, including when `editing` is `true`. |
| `label` | `string` | `"Symbol"` | Accessible input label and prefix for the button's label. |
| `className` | `string` | None | Styles the tag wrapper. |

Click or press Enter on the tag to edit with the current symbol selected. Enter submits; an empty or unchanged normalized draft closes without committing. Escape or blur cancels. Keyboard exits restore focus to the tag; blur leaves focus where it moved. With controlled `editing`, update it in `onEditingChange` to complete the exit.

Typing on the closed tag does not open it, so single-key panel bindings still work. While editing, Enter and Escape call `preventDefault` and `stopPropagation`, preventing `editing`-scope bindings from also firing.

Dialog behavior is inferred from library source, not covered by the browser matrix: Base UI (1.8.0) listens for Escape on the document in the bubble phase, so cancelling the edit should leave the dialog open. Radix's capture-phase listener runs first, so the same Escape can close its dialog.

External `value` changes show a 900 ms `panel-sync` ring, including changes from a link group. The initial value and locally committed value do not ring. Reduced motion or an unavailable animation API disables the ring.

### Link groups

`useLinkGroup()` requires `LinkGroupProvider`; there is no shared module-level fallback on the server. It returns `{ group, symbol, setSymbol, setGroup, cycleGroup }`. A `LinkGroup` is `1 | 2 | 3 | 4 | null`, where `null` means unlinked.

| Hook option | Type | Default | Purpose |
|---|---|---|---|
| `group` | `LinkGroup` | Internal state | Controlled group. |
| `defaultGroup` | `LinkGroup` | `null` | Initial uncontrolled group. |
| `onGroupChange` | `(group: LinkGroup) => void` | None | Receives requests from `setGroup` or `cycleGroup`; update a controlled `group` here. |
| `defaultSymbol` | `string \| null` | `null` | Initial symbol, trimmed; blank becomes `null`. |
| `onSymbolChange` | `(symbol: string \| null) => void` | None | Reports displayed symbol changes for persistence. |
| `source` | `string` | None | Writer identity stored with group writes, usually the panel id. |

`setSymbol(string | null)` trims without changing case; blank becomes `null`. Unlinked, it changes this panel alone. Linked, it changes the group, including clears. Joining adopts the group's symbol or clear; an untouched group takes the first joiner's nonblank symbol as a local seed. Seeds do not cross windows and yield to real writes, so restored defaults cannot overwrite another window's written symbol. Leaving keeps the displayed symbol.

Persist the group and symbol yourself. `onSymbolChange` skips an unchanged initial symbol, but can fire during mounting if joining a group changes it.

`cycleGroup(step?)` cycles through unlinked, 1, 2, 3, 4, then unlinked; `step` is `1` by default or `-1` for reverse. `LinkGroupDot` uses this order on click, reversed by Shift+click. It shows a number and an accessible label as well as a color from `--link-1` to `--link-4`.

| LinkGroupDot prop | Type | Default | Purpose |
|---|---|---|---|
| `group` | `LinkGroup` | Required | Displayed group. |
| `onGroupChange` | `(group: LinkGroup) => void` | Required | Receives the next group. |
| `onClick` | `MouseEventHandler<HTMLButtonElement>` | None | Runs before cycling; `preventDefault()` cancels it. |
| `className` | `string` | None | Styles the button. |
| Other button props | `Omit<ComponentProps<"button">, "onChange" \| "children">` | None | Includes `disabled`, accessible labels, and event handlers. |

#### Between windows

| LinkGroupProvider prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `LinkGroupStore` | New store | Supply a store; its transport takes precedence over `transport` and `channel`. |
| `transport` | `LinkTransport \| null` | BroadcastChannel | Cross-window transport; `null` keeps links local. Read at initialization. |
| `channel` | `string` | `"tradecn-link"` | Default channel name, read at initialization. |
| `children` | `ReactNode` | None | Panels sharing the store. |

Providers on the same origin and channel exchange symbols when `BroadcastChannel` is available. The provider connects its store while mounted. A transport opens its channel with the first subscriber and closes it with the last. Incoming messages are validated.

For separate desktop webviews, `createCallbackTransport({ send, receive })` adapts the shell's event bus to `LinkTransport`, whose methods are `post(message)` and `subscribe(callback)`. Each window runs its own provider; the shell forwards messages between them.

| Callback transport option | Type | Default | Purpose |
|---|---|---|---|
| `send` | `(message: LinkMessage) => void` | Required | Sends to other windows. |
| `receive` | `(deliver: (message: unknown) => void) => () => void` | Required | Starts on the first subscriber; its returned function stops listening after the last. Messages are validated before delivery. |

`createLinkGroupStore(options?)` provides the store without React. Pass it to the provider, or call `connect()` yourself and retain the returned disconnect function.

| Store option | Type | Default | Purpose |
|---|---|---|---|
| `transport` | `LinkTransport \| null` | `null` | Links stay local unless supplied. |
| `id` | `string` | Generated id | Store identity used to break cross-window version ties. |

Connecting requests other windows' written symbols, excluding seeds. Concurrent writes settle on the higher version, then the higher origin id. A write made just after reloading, before replies arrive, can still be replaced by an older window's state.

### Popout

`usePopout()` and `PanelPopout` move a panel into a window of its own and back, without remounting it.

See [Popout panel](#popout-panel) for a complete example. Call `usePopout` inside a component. Add `HotkeysProvider` for shortcuts or `LinkGroupProvider` if the panel uses linked symbols. `PanelPopout` accepts:

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `popout` | `Popout` | Required | Handle from `usePopout`. |
| `placeholder` | `ReactNode` | None | Content left in the page while open. |
| `children` | `ReactNode` | None | Content moved between the page and window. |

`usePopout(options?)` accepts:

| Option | Type | Default | Purpose |
|---|---|---|---|
| `title` | `string` | Unchanged | Window title, set on opening. |
| `width`, `height` | `number` | `640`, `420` | Requested inner size in CSS pixels, rounded. |
| `left`, `top` | `number` | Browser decides | Requested screen position in CSS pixels, rounded. |
| `name` | `string` | `"_blank"` | Window name; a matching name reuses a window. |
| `copyStyles` | `boolean` | `true` | Copies styles and mirrors root attributes. |
| `openWindow` | `(features: string) => Window \| null` | `window.open` | Shell adapter; must return a same-origin window synchronously. |
| `onOpen` | `(popout: Window) => void` | None | Runs after obtaining the window, before React moves the host. |
| `onClose` | `() => void` | None | Runs from `close()` or the popout's `pagehide`; unmount cleanup does not call it. |
| `onBlocked` | `() => void` | None | Runs when the opener returns `null`. |

The handle exposes `isOpen`, `window`, `host`, `slotRef`, `open()`, and `close()`. `PanelPopout` handles the host and slot for you; without a host, as on the server, it renders no children.

Call `open()` from a click or key press. It returns `false` when blocked and `true` on success; calling it while open focuses the existing window. Closing or reloading the popout returns the panel to the page. Unmounting the hook or leaving the opener closes the window. Give the panel `h-full` to fill the popout host.

One portal host moves between documents, preserving React state, subscriptions, and context. The popout shares the opener's JavaScript and stores, so link groups need no transport. `PanelPopout` attaches hotkeys to the popout document when under `HotkeysProvider`.

Stylesheets and the body's class are copied on opening. Root attributes stay synchronized, so theme toggles follow. `copyStyles: false` disables both copying and mirroring.

- Browser state such as focus, scroll positions, and CSS animations can reset during the move; iframes can reload.
- Portals targeting the opener's `document.body` still open there, including menus, tooltips, or dialogs configured that way.
- Stylesheets hot-reloaded after opening are not copied again.
- Separate JavaScript contexts cannot share this portal. Render panels in each window and connect them with `LinkTransport`.

### Tokens

The install adds missing `panel-active`, `panel-drag-target`, `panel-error`, `panel-sync`, and `link-1` through `link-4` tokens for borders, the sync ring, and group colors.

### What it does not do

Use [`workspace`](workspace.md) for layout, docking, resizing, and tabs. Your app owns persistence and fetching data for the selected symbol.
