# panel

The frame around a book, a chart, or a blotter: a hotkey scope with a header, a symbol tag, link groups, and a popout.

## Usage

```tsx
import { LinkGroupDot, Panel, PanelActions, PanelContent, PanelHeader, PanelTitle, SymbolTag } from "@/components/ui/panel"
import { LinkGroupProvider, useLinkGroup } from "@/hooks/use-link-group"
import { HotkeysProvider, useHotkey } from "@/hooks/use-hotkeys"
```

```tsx
function Book({ id }: { id: string }) {
  const link = useLinkGroup({ source: id, defaultSymbol: "ZN" })
  useHotkey("book.cancel", cancelSelected)
  return (
    <Panel kind="book">
      <PanelHeader>
        <PanelTitle>Order book</PanelTitle>
        <SymbolTag value={link.symbol} onCommit={link.setSymbol} />
        <LinkGroupDot group={link.group} onGroupChange={link.setGroup} />
        <PanelActions>
          <Button size="icon-xs" variant="ghost" onClick={close}>×</Button>
        </PanelActions>
      </PanelHeader>
      <PanelContent>{/* rows */}</PanelContent>
    </Panel>
  )
}

<HotkeysProvider bindings={BINDINGS}>
  <LinkGroupProvider>
    <Book id="book-1" />
    <Book id="book-2" />
  </LinkGroupProvider>
</HotkeysProvider>
```

## Composition

Use the following composition to build a panel:

```
Panel
├── PanelHeader
│   ├── PanelTitle
│   ├── SymbolTag
│   ├── LinkGroupDot
│   └── PanelActions
└── PanelContent
```

`PanelPopout` wraps a `Panel` to move it into a window of its own; see Popout below.

## API Reference

### A panel is a hotkey scope

`kind="book"` is the scope `panel:book`. It names a kind of panel, not an instance: declare `book.cancel` once, call `useHotkey("book.cancel", ...)` inside the panel, and with two books on screen the one holding focus is the one that answers. Clicking anywhere in a panel is enough to aim the keyboard at it. Palette actions with `scope: "panel:book"` are on offer only when the palette was opened from inside one. A `Panel` renders without a `HotkeysProvider`; its keys start working inside one.

`Panel` is a `region` named by its `PanelTitle`, or by an `aria-label` if you pass one.

The border says one thing at a time. `error` outranks `dragTarget`, which outranks active. Leave `active` out and the panel is active while focus is inside it; pass it when a layout decides which panel is active, and `active={false}` holds the border off even with focus inside. The state is on the element as `data-state`.

### The header is a drag handle

`PanelHeader` carries `data-panel-handle`, for a layout that takes a handle selector. The panel does not drag anything itself. `SymbolTag`, `LinkGroupDot`, and everything inside `PanelActions` stop `pointerdown`, `mousedown`, and `touchstart` from reaching the header, so pressing a button does not pick the panel up. A layout built on HTML drag and drop (`draggable`) starts its drag from `dragstart`, which these do not stop; give such a layout its own handle element beside them.

There is no icon here, because shadcn ships a different icon library per base. `PanelActions` is a place for your buttons.

### SymbolTag

Click it, or press Enter on it, and it becomes your `input` with the symbol selected. Enter commits, Escape and clicking away put the old symbol back. A blank draft, or the symbol already showing, commits nothing. After Enter or Escape focus returns to the tag, so it stays inside the panel and the panel's keys keep working; after a click away, focus stays where you clicked.

`normalize` trims and upper-cases by default; pass your own where case matters (`BRK.b`). `validate` returning false keeps the field open and marks it `aria-invalid`. `editing` and `onEditingChange` control the field from outside, which is how a hotkey opens it.

While the field is open, Enter and Escape are its own: it calls `preventDefault` and `stopPropagation`, so an `editing`-scope binding on either does not also fire. The tests hold that.

A panel inside a dialog is a different matter, and this part is read from the two libraries' source, not exercised by the browser matrix. Base UI (1.8.0) closes a dialog from a bubble-phase `keydown` listener on the document, which a `stopPropagation` from inside React never reaches, so the Escape that cancels the edit should leave the dialog open. Radix listens on the document with `capture: true`, which runs before any component inside the dialog, so there the same Escape closes it.

The tag does not open when you start typing at it. Focus rests on the tag after every commit, and a panel's single-key bindings have to keep working from there.

When the symbol changes and it was not typed into this tag, the tag rings once in `panel-sync`. That is how a panel shows it followed its link group. Under `prefers-reduced-motion` it does not ring.

### Link groups

Panels in the same group show the same symbol. `useLinkGroup()` gives a panel `{ group, symbol, setSymbol, setGroup, cycleGroup }`, and needs a `LinkGroupProvider` above it. There is no module-level store to fall back on: on a server that would be one store shared by every request.

- Unlinked, the symbol is the panel's own.
- Joining a group that has a symbol adopts it.
- Joining a group nobody has written to gives it this panel's symbol. That is a seed: it stays in this window, and any real write replaces it. A symbol restored from storage therefore never overrules the one people are looking at in another window.
- Leaving a group keeps what was showing.
- `setSymbol(null)` on a linked panel clears the group, and the other panels follow the clear.

Groups are `1` to `4`, or `null` for unlinked, and they are numbers because the colors are yours: `--link-1` to `--link-4`. `LinkGroupDot` shows the number inside the color, since color is never the only channel. Click moves to the next group, Shift+click to the one before.

Persistence is yours. `group`, `defaultGroup`, and `onGroupChange` control the group. `defaultSymbol` is where the panel starts, and `onSymbolChange` fires whenever what the panel shows changes, by its own hand or through its group, and not on the first render. `source` is recorded on the group with each write.

#### Between windows

The provider opens a `BroadcastChannel` named `tradecn-link`, so every same-origin window or tab with a provider follows. `channel="rates"` renames it, `transport={null}` keeps links inside one window, and `transport` takes anything with `post(message)` and `subscribe(cb)`, which is how a desktop shell uses its own events instead. The channel opens when the provider mounts and closes when it unmounts.

A store that connects asks the others what they hold, so a window opened late shows the group's symbol instead of nothing. When two windows write at once the higher version wins, and on a tie the higher window id, so both settle on the same symbol. Messages are validated on the way in. `createLinkGroupStore()` is the store without React, and `store` on the provider takes one you made.

One narrow race is not closed: a window that reloads and writes within a few milliseconds, before the others have answered its hello, can have that first write replaced by what they held.

### Popout

`usePopout()` and `PanelPopout` move a panel into a window of its own and back, without remounting it.

```tsx
const popout = usePopout({ title: "Order book", width: 720, height: 480 })

<PanelPopout popout={popout} placeholder={<Button onClick={popout.close}>Bring it back</Button>}>
  <Book id="book-1" />
</PanelPopout>

<Button onClick={popout.open}>Pop out</Button>
```

The children render through a portal into one host element. The host sits in the page while the popout is closed and in the popout's body while it is open, and moving a DOM node does not remount what React rendered into it. State, subscriptions, and context carry over both ways. The popout runs in the opener's JavaScript: one React tree, one set of stores, so a link group needs no transport to reach it. Inside a `HotkeysProvider`, `PanelPopout` attaches the registry to the popout's document, and the panel's keys work there.

`open()` has to run inside a click or a key press, returns false when the browser blocked it, and calls `onBlocked`. Calling it while open focuses the window. The page's stylesheets are copied in, and the root element's attributes are mirrored and kept in step, so a theme class follows a toggle; `copyStyles={false}` turns both off. Closing the popout from either side returns the panel to the page, and unmounting the panel or leaving the page closes the window. In the popout the host fills the viewport, so give the panel `h-full`.

`openWindow` replaces `window.open` for a shell that makes its own windows. It must hand back a same-origin window synchronously, because the panel is moved into it in the same tick.

What does not come along:

- Moving a node between documents resets what the browser keeps on it: scroll positions, focus, running CSS animations, and an iframe reloads. React state is kept; that is not the same thing.
- Anything your shadcn components portal to `document.body` (a tooltip, a menu, a dialog) opens in the main window, because that is the `document` they were built with. Keep those out of a popped-out panel, or accept where they land.
- In dev, a stylesheet hot-reloaded after the popout opened is not copied again.
- A desktop shell whose windows are separate JavaScript contexts cannot do this at all. There, each window renders its own panels and a `LinkTransport` carries the links.

### Tokens

The install adds `panel-active`, `panel-drag-target`, `panel-error`, `panel-sync`, and `link-1` to `link-4` to your stylesheet if you do not have them. The border and the dots draw from them.

### What it does not do

Layout, docking, resizing, or tabs. That is [`workspace`](workspace.md). It does not persist a group or a symbol, and it does not fetch anything for the symbol it holds.
