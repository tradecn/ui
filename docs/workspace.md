# workspace

`npx shadcn add tradecn/ui/workspace` puts `workspace.tsx` and `panel.tsx` in your `ui` alias, `use-link-group.tsx`, `use-popout.ts`, and `use-hotkeys.tsx` in your `hooks` alias, `workspace-layout.ts`, `link-group.ts`, and `hotkeys.ts` in your `lib` alias, and brings your own `input` if you do not have it. It adds the panel tokens to your stylesheet (`panel-active`, `panel-drag-target`, `panel-error`, `panel-sync`, `link-1` to `link-4`) and appends one class to it, `.dockview-theme-tradecn`, inside `@layer components`. Dependencies: `cn`, `dockview-react`. If you already installed `panel`, the shared files are byte-identical and nothing of yours changes.

```tsx
const PANELS = { book: Book, chart: Chart }

<Workspace
  className="h-screen"
  panels={PANELS}
  defaultLayout={localStorage.getItem("layout")}
  onLayoutChange={(layout) => localStorage.setItem("layout", JSON.stringify(layout))}
  seed={(api) => {
    api.addPanel({ kind: "book", state: { symbol: "ZN" } })
    api.addPanel({ kind: "chart", position: { reference: "book-1", direction: "right" } })
  }}
/>
```

## The dependency

This is the one item that brings a package of any weight, so here is what it is. `dockview-react` does docking, tabs, floating groups, popout windows, and a layout that goes to JSON and back. shadcn's `resizable` does the last of those and none of the others, and a grid layout library gives you tiles that do not dock. Checked against `8.3.1` on 2026-09-21: MIT; it brings two packages with it, `dockview` (a re-export) and `dockview-core`, from the same repository as itself, and nothing under those. Some of its options live in a separate `dockview-enterprise` package under a licence of its own (keyboard navigation, drag compass, multi-row tabs, smart guides, edge groups) and this item uses none of them. Its keyboard story is the hotkey registry, below.

The dock's stylesheet is imported by `workspace.tsx`, so there is nothing to add to yours. Keep `panels` the same object between renders, a module constant or a `useMemo`: it is the dock's component table, and a new one re-renders every panel.

## Panels by kind

`panels` maps a kind to the component that draws it. The workspace wraps every panel in a `Panel` of its kind, so each one is the hotkey scope `panel:<kind>`, a `region` named by its title, and wears the active border when the dock says it is the active panel. Inside the component, `useWorkspacePanel()` is the panel:

```tsx
function Book() {
  const panel = useWorkspacePanel()
  const link = useLinkGroup({
    source: panel.id,
    defaultGroup: (panel.state.group as LinkGroup) ?? null,
    defaultSymbol: (panel.state.symbol as string) ?? null,
    onGroupChange: (group) => panel.setState({ group }),
    onSymbolChange: (symbol) => panel.setState({ symbol }),
  })
  useHotkey("book.cancel", cancelSelected)
  return (
    <>
      <PanelHeader>
        <SymbolTag value={link.symbol} onCommit={link.setSymbol} />
        <LinkGroupDot group={link.group} onGroupChange={link.setGroup} />
        <PanelActions>
          <Button size="icon-xs" variant="ghost" onClick={panel.float}>float</Button>
          <Button size="icon-xs" variant="ghost" onClick={panel.popout}>pop out</Button>
        </PanelActions>
      </PanelHeader>
      <PanelContent>{/* rows for link.symbol */}</PanelContent>
    </>
  )
}
```

The handle has `id`, `kind`, `title`, `state`, `active`, and `location` (`grid`, `floating`, `popout`), and `setTitle`, `setState`, `close`, `float`, `popout`, `toggleMaximize`. The component is given `id` and `kind` as props too, for the outer component that does not want the hook.

In a workspace the tab is the drag handle, not `PanelHeader`. Put a `PanelHeader` in a panel for its symbol tag, its link dot, and its actions; nothing listens to it for a drag. The tab shows the title and a close button. There is no right-click menu on a tab: the dock has one of its own, unstyled by this item and not wired, and a menu of yours would be your shadcn `context-menu`.

A kind the workspace was not given draws a placeholder that says so, in a panel that can still be closed, so a stored layout from a build that had more kinds still opens. `unknownPanelKinds(layout, Object.keys(PANELS))` tells you which, up front.

## What a panel keeps

`state` is what the panel keeps across a reload: a symbol, a link group, a view setting. It is JSON, and it is small. `setState` takes a patch and merges it, or a function of the state before that returns a patch; a key set to `undefined` is removed. What goes in is stored as JSON would store it, so a function or a `Date` becomes what `JSON.stringify` makes of it. A patch that changes nothing changes nothing: no render, no save.

The restored symbol goes into the link group as a seed (see `docs/panel.md`), so a symbol from storage never overrules the one people are looking at in another window.

## The layout, and what it leaves out

`onLayoutChange` gets a `WorkspaceLayout`:

```ts
{
  version: 1,
  kind: "tradecn-workspace",
  dockview: { ... },                       // the dock's own form: where everything sits, floating and popout positions too
  panels: { "book-1": { kind: "book", title: "Order book", state: { symbol: "ZN", group: 1 } }, ... },
  boundaries: WORKSPACE_PERSISTENCE_BOUNDARIES,
}
```

Read `panels`, not `dockview`. The dock's form is its own and may change with its version; the records are this item's and will not.

A layout is meant to be reused: saved as a template, handed to a colleague, restored next quarter. That only works if nothing tied to a session is in it, and `boundaries` says, in the payload, what the writer put in and what it kept out:

- `autosave`: in the layout, and a fresh one is handed over when any of it changes. The dock arrangement, floating and popout positions, each panel's kind, title, and state.
- `workspaceScoped`: belongs to one workspace and is not in the layout. Column widths and sort, a selection, a scroll position, a half-typed ticket. Store these beside the layout, keyed by panel id, if you store them at all.
- `globalScoped`: belongs to the person, whichever workspace is open. Hotkey remaps, palette recents, the theme, instrument conventions.
- `excluded`: stored by nobody. Market data, orders and their status, positions, feed health, and the symbol a link group holds right now.

This item can hold you to the first: `state` is JSON and it is per panel. The other three are a promise you keep, and a reader of a stored layout, two years on, can see what the promise was. Nothing in the layout points at a server or a session by design, so a layout from one desk opens on another.

`parseWorkspaceLayout(value)` reads one back, from the object or its JSON text, and returns `null` for anything that is not a version 1 tradecn workspace whose every docked panel has a record with a kind. A record with no panel is dropped, a missing title becomes the kind, and the state is cleaned. It hands back a copy, so the object you stored is not the one the dock gets. `defaultLayout` runs through it; so does `api.load`. When a version 2 exists, the parser will take a 1 and hand back a 2.

## Saving is yours

The layout is handed over `layoutChangeDelay` milliseconds (250 by default) after the last change, because a sash drag reports a change on every pointer move. Restoring a layout is not a change, and neither is a report from the dock that left the layout as it was. The last change is written out when the workspace unmounts, so closing a page does not lose a move made a moment before. Where it goes is yours: `localStorage`, a file in a desktop shell, the server. `onLayoutError` hears about a stored layout that was refused, and about a write that threw.

With no `defaultLayout`, or one that does not parse, `seed(api)` builds the starting layout. Seeding is a change, and it is saved.

## Keys

The workspace declares no bindings of its own. It gives you `api.focusPanel(id)`, `api.focusNext()`, `api.focusNext(-1)`, `api.addPanel`, and `closePanel`, and you bind them:

```ts
const BINDINGS: HotkeyBinding[] = [
  { id: "workspace.next", keys: "]", scope: "global", description: "Next panel" },
  { id: "workspace.previous", keys: "[", scope: "global", description: "Previous panel" },
  { id: "workspace.book", keys: "n b", scope: "global", description: "New book" },
]
useHotkey("workspace.next", () => api.focusNext())
```

`focusPanel` makes the panel active and puts the keyboard inside it, so the keys of `panel:<kind>` answer from there; clicking a tab does the same. The dock's own keyboard navigation is one of the enterprise modules and is off, which suits: the registry is the one place keys are declared, and the one list a palette or a help overlay reads.

## Floating, popout, maximize

`api.float(id)` lifts a panel out of the grid into a group that floats over it; `api.toggleMaximize(id)` fills the workspace with it and back; `api.popout(id)` moves it to a window of its own. All three are on the handle too. Dragging a tab with Shift held floats it (the dock's own gesture), and `disableFloating` turns floating off. `locked` stops dragging and resizing.

A popout runs in the page's JavaScript: one React tree, one set of stores, so a link group needs no transport to reach it, and state is kept, as with `PanelPopout`. The dock copies the page's stylesheets into the window; the workspace attaches the hotkey registry to that document, so the panel's keys work there, and mirrors the root element's attributes into it and keeps them in step, so a `dark` class follows a toggle. What does not come along is the same as for `PanelPopout`: anything your shadcn components portal to `document.body` opens in the main window, a stylesheet hot-reloaded after the window opened is not copied again, and a desktop shell whose windows are separate JavaScript contexts cannot do this.

The window opens a page from your origin, `/popout.html` by default, and that page has to exist: in a Vite project, an empty `public/popout.html`. `popoutUrl` names another. `popout()` has to run inside a click or a key press and resolves to `false` when the browser blocked it. Closing the window from its own close button puts the panel back in the grid.

A popout is part of the layout, so a layout saved with one open asks for that window again when it is restored. That happens on page load, with no click behind it, and a browser that blocks the window gets the panel back in the grid with an error from the dock in the console. Close popouts before you save a layout as a template.

## The theme

The dock draws itself from CSS variables, and the registry item's `css` block appends one class to your stylesheet that sets every one of them from your tokens: `--dv-group-view-background-color: var(--background)`, the tab strip from `--muted`, tab text from `--foreground` and `--muted-foreground`, separators from `--border`, the active sash and the drop indicator from `--ring`, the dropdown radius from `--radius`. So the dock follows your theme, light and dark, and follows a tradecn theme item too. `scripts/workspace-theme.test.ts` holds that class against the installed dock's own theme, so a variable dockview adds in a later version is a failing test here, not a transparent tab.

Its overlay z-index is 30, under the 50 your dialogs and menus use, so a menu opened from a floating panel is not behind another floating panel. The dock's tab-group colors, used only if you turn that feature on through `api.dockview`, map to `--chart-1` to `--chart-5`.

## The dock's own API

`api.dockview` is dockview's `DockviewApi`, with the types from `dockview-react`, for what this item does not cover. Changes made through it are still saved. What it does to a panel this item does not know about (a panel added with a component name other than the workspace's) is outside this item's contract.

## What it does not do

It does not persist anything, fetch anything, or confirm a close: a panel closes when its tab's button is pressed, and a ticket with a draft in it is closed with it. It does not give a panel a minimum size, a tab a right-click menu, or the dock its keyboard navigation. Those are yours through `api.dockview` if you want them, and the first two may become options here.
