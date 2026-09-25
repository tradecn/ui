# CommandPalette

Search registered actions and symbols in a dialog or inline command line, with shared recents and live shortcuts from the hotkey registry. Compose the dialog, groups and result markup with public parts built on your shadcn `command` component.

## Usage

```tsx
import { CommandGroup } from "@/components/ui/command"
import { useState } from "react"
import { HotkeysProvider } from "@/hooks/use-hotkeys"
import {
  CommandPalette,
  CommandPaletteContent,
  CommandPaletteDialog,
  CommandPaletteEmpty,
  CommandPaletteInput,
  CommandPaletteItem,
  CommandPaletteList,
  CommandPaletteResults,
  createActionRegistry,
} from "@/components/ui/command-palette"
```

```tsx
export default function CommandPaletteDemo() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState("None")
  const [actions] = useState(() => {
    const registry = createActionRegistry()
    registry.register([
      { id: "orders", title: "Show orders", run: () => setSelected("Show orders") },
      { id: "positions", title: "Show positions", run: () => setSelected("Show positions") },
    ])
    return registry
  })
  return (
    <HotkeysProvider>
      <div className="flex min-h-80 w-fit max-w-full flex-col justify-center gap-3 text-sm">
        <button type="button" className="self-start rounded border border-border px-3 py-2 hover:bg-muted" onClick={() => setOpen(true)}>Open commands</button>
        <p role="status">Selected: {selected}</p>
        <CommandPalette actions={actions} open={open} onOpenChange={setOpen}>
          <CommandPaletteDialog>
            <CommandPaletteContent>
              <CommandPaletteInput />
              <CommandPaletteList>
                <CommandPaletteEmpty>No results</CommandPaletteEmpty>
                <CommandPaletteResults>
                  {(group) => (
                    <CommandGroup heading={group.heading}>
                      {(group.id === "recent" ? group.rows.slice(0, 5) : group.rows).map((row) => (
                        <CommandPaletteItem key={row.key} row={row}>{row.title}</CommandPaletteItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandPaletteResults>
              </CommandPaletteList>
            </CommandPaletteContent>
          </CommandPaletteDialog>
        </CommandPalette>
      </div>
    </HotkeysProvider>
  )
}
```

Open the dialog and choose an action. The caption shows which callback ran; replace those callbacks with navigation or another application action. `HotkeysProvider` also enables the default opening shortcut: ⌘K on macOS, Ctrl+K elsewhere. Focus the preview before trying it here.

`CommandPalette` coordinates behavior and requires children. `CommandPaletteResults` provides groups; the callback owns their markup. Use ordinary shadcn `CommandGroup` and `CommandShortcut` where needed. The examples cap the recent group at five rows.

Keep the action registry stable for the lifetime of the view. This example creates and populates its own registry in a lazy state initializer; [scoped actions](#scoped-and-secondary-actions) show registration with unmount cleanup.

## Inline commands

Use `variant="go-bar"` for an always-visible command line. Focus it, or press `/` while focus is in this preview and outside a text field. Type `AAPL` to see its functions, then `AAPL G` to narrow to the price chart command. Enter selects it; Escape clears and blurs the input.

The grammar accepts `AAPL`, `MSFT`, or `ZN`, followed by `DES` or `GP`. It reports the selected command below the input. These rows come from `goBarGrammar`, so they do not require asynchronous symbol search or enter recents. This layout reads groups with `useCommandPalette()`, puts each description below its title, and adds application help beneath the input. It uses the same input, selection and focus behavior as the dialog.

<!-- demo: command-palette-go-bar -->

## Symbol search

Supply a `SymbolSearchAdapter` for asynchronous lookup. Here, two or more letters search three local symbols after a short delay, making the searching state visible. Try `AA`, `MS`, or `ZN`. Changing the query cancels the pending lookup; the adapter clears its timer when aborted.

Enter selects the highlighted symbol. Shift+Enter, or clicking its Watch hint, requests watching it instead. The caption shows which callback ran. Replace the delayed local lookup with your symbol service and pass the supplied abort signal to the request.

<!-- demo: command-palette-symbols -->

## Scoped and secondary actions

Open global commands to see Show help. Open book commands to also see Refresh book, because that button sits inside the book's hotkey scope. The palette captures the scope before taking focus. Enter on Refresh book increments its counter; Shift+Enter, or clicking Reset, resets it instead.

With focus on the book's button and the palette closed, press `r` to run the same refresh handler directly. The row gets its shortcut from `bindingId`. `Book` runs beneath `HotkeyScope`, and its effect returns the action registry's cleanup so unmounting removes the action.

<!-- demo: command-palette-scoped-actions -->

## Shared recents

Pass the same action registry to both presentations to share actions and recent selections. Choose Show positions in the inline command line, then open the dialog: it appears under Recent. Select Show orders in the dialog and reopen the inline list to see the change there too.

This example keeps recents in memory for its lifetime. [Recents](#recents) describes the save and restore APIs for application-owned persistence.

<!-- demo: command-palette-shared-recents -->

## API Reference

<div id="props"></div>

### `<CommandPalette>` <!-- heading-id: commandpalette-root -->

<!-- api-props -->

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `actions` | `ActionRegistry` | Required | Registry created by `createActionRegistry()`. |
| `children` | `ReactNode` | Required | Caller-owned dialog or inline content. |
| `variant` | `"palette" \| "go-bar"` | `"palette"` | Selects keyboard and focus behavior; it does not insert a dialog. |
| `open` | `boolean` | Uncontrolled | Controls the dialog or go-bar dropdown. |
| `defaultOpen` | `boolean` | `false` | Initial open state when uncontrolled. |
| `onOpenChange` | `(open: boolean) => void` | — | Receives requested open-state changes in either mode. |
| `symbols` | `SymbolSearchAdapter` | — | Supplies asynchronous symbol results. |
| `onSymbolSelect` | `(symbol: SymbolResult) => void` | — | Runs for a symbol's primary selection. |
| `symbolSecondary` | `{ title: string; run: (symbol: SymbolResult) => void }` | — | Alternate symbol action; does not call `onSymbolSelect`. |
| `goBarGrammar` | `(input: string) => readonly PaletteAction[]` | — | Synchronous command rows for nonempty input, in either variant. |
| `hotkeys` | `HotkeyRegistry \| null` | Nearest `HotkeysProvider`, or `null` | Supplies bindings and row shortcuts; `null` opts out. |
| `hotkey` | `string \| false` | `"mod+k"` or `"/"` by variant | Default opening or focus binding; `false` disables its registration and handler. |
| `labels` | `Partial<CommandPaletteLabels>` | See The rest | Overrides accessible names, default input placeholder, group headings and binding text. |

When `open` is supplied, update it in `onOpenChange` to accept requests to open or close. Without it, the component manages that state.

### `<CommandPaletteDialog>`

Optional modal wrapper connected to the root's open state. Put one `CommandPaletteContent` inside. It forwards your shadcn `CommandDialog` props except managed `open`, `defaultOpen` and `onOpenChange`; `children` is required. `title` and `description` default to the root labels; `className` styles the modal content. Both supported bases trap focus. Base UI restores focus to the opener; the Radix wrapper has no dialog trigger, so closing it can leave focus on the page body. Compose your own dialog when you need Radix focus restoration or a different shell, using the root's controlled `open` and `onOpenChange` props.

### `<CommandPaletteContent>`

Owns one query, action/recent/shortcut subscriptions, and symbol search. Mount one per root. It requires children and forwards `Command` props and refs except `shouldFilter`, which stays false so asynchronous results keep caller order. `loop` defaults to true; `label` defaults to `labels.title`. It adds lining and tabular figures and carries `data-slot="tradecn-command-palette"` and `data-variant`.

An `onKeyDown` or `onBlur` handler runs first; `preventDefault()` cancels the corresponding shared behavior. Application controls inside Content keep their own Enter and navigation keys; these stop before the command root. Use `onKeyDownCapture` to observe them at the root. Escape and the opening shortcut still reach shared close behavior. Input state lasts as long as Content stays mounted. A normal dialog unmounts it on close; inline blur retains the query. Selection and inline Escape clear it.

### `<CommandPaletteInput>`

Forwards `CommandInput` props and its input ref except managed `value`, `defaultValue`, `onValueChange` and the primitive-owned `onChange`. Use `onChangeCapture` to observe native changes. Read or change the query through `useCommandPalette()`. `placeholder` defaults to `labels.placeholder`. Inline focus requests opening; your `onFocus` runs first and can cancel it with `preventDefault()`. Use one input per root.

### `<CommandPaletteList>`

Forwards `CommandList` props and ref. In a go-bar it renders only while open, positions itself below Content, and prevents mouse down from blurring the input before selection. Override placement with `className`; place application controls outside the list when they need normal focus behavior. Dialog lists remain in normal flow.

### `<CommandPaletteResults>`

Optional keyed group iterator. Its required child is `(group: PaletteGroup) => ReactNode`; each group gets a stable keyed fragment. The caller supplies `CommandGroup`, rows and their keys. For a different group order or a flat list, read `groups` from `useCommandPalette()` and map them directly. The underlying command follows the rendered row order.

<!-- api-props -->

| `PaletteGroup` field | Type | Purpose |
|---|---|---|
| `id` | `string` | `recent`, `commands`, `symbols`, or `actions:` followed by the group heading. |
| `heading` | `string` | Localized group heading or the action's own group. |
| `rows` | `readonly PaletteRow[]` | Eligible rows in ranked or registration order. |

### `<CommandPaletteItem>`

Requires a `row: PaletteRow` and caller-owned `children`. Forwards `CommandItem` props and ref except managed `value` and `onSelect`. The primitive owns `onClick` and `onPointerMove`, so these props are excluded; use `onClickCapture` or `onPointerMoveCapture` and `stopPropagation()` to intercept them. It sets `data-row={row.key}` and selects through the shared behavior. Native `disabled` prevents selection. Use `row.key` as the React key, and keep row keys unique within a rendered list.

<!-- api-props -->

| `PaletteRow` field | Type | Purpose |
|---|---|---|
| `key` | `string` | Result identity; distinguishes registered, grammar, symbol and recent rows. |
| `title` | `string` | Action title or symbol. Render it or supply a meaningful accessible name. |
| `subtitle` | `string \| undefined` | Action subtitle, or symbol name and exchange joined with ` · `. |
| `badge` | `string \| undefined` | Scope with `panel:` removed, or symbol kind. |
| `keys` | `string \| undefined` | Current binding keys; pass to `CommandPaletteKeys`. |
| `secondary` | `{ title: string; run: () => void } \| undefined` | Alternate callback and text. |
| `run` | `() => void` | Raw callback. Use Item or `select` to retain query, closure and recent behavior. |
| `recent` | `PaletteRecent \| null` | Entry to remember after selection; null for grammar rows. |

A removed result cannot run through `select`; it resolves the requested key against the current offered rows. Scope filtering controls discovery, not authorization. Action callbacks must enforce application permissions.

### `<CommandPaletteSecondary>`

Optional native button inside an Item. Requires caller content and renders only when the row has a secondary action. It inherits a disabled Item, retains input focus on mouse down, and stops the click from selecting the primary action. Your `onClick` can cancel it with `preventDefault()`.

It defaults to `type="button"`, `tabIndex={-1}` and selected-row-only visibility. A disabled Secondary blocks both its click and Shift+Enter; a disabled Item blocks both actions. Shift+Enter invokes the same alternate action from the input, even when you omit the button. Supply a discoverable hint when offering secondary actions. The symbols and scoped-action examples show the composition.

Children of a listbox option are presentational to assistive technology, so the secondary button's disabled state is not announced. Include an unavailable cue in the row's text or accessible name when disabling its secondary action.

### `<CommandPaletteKeys>`

Formats required `keys: string` as key caps. Accepts native span props and ref, excluding children. Optional `platform: Platform` overrides the nearest root's hotkey platform; outside a root it uses the formatter's platform detection. It creates no subscription.

### `<CommandPaletteEmpty>`

Forwards `CommandEmpty` props and ref, with required caller-owned children. The command primitive shows it when no rendered items remain. Read `loading` to choose between a searching message and an empty message. It creates no live region; add `role="status"` if your application needs an announcement.

### `useCommandPalette()`

Reads the nearest Content without starting subscriptions, timers or requests. Multiple readers share the same search.

<!-- api-props -->

| Returned value | Type | Purpose |
|---|---|---|
| `groups` | `readonly PaletteGroup[]` | All eligible results. Callers choose group order, row markup and limits. |
| `input`, `setInput` | `string`, `(input: string) => void` | Raw query and setter; matching uses trimmed input. |
| `loading` | `boolean` | A qualifying symbol query has no current answer. |
| `open`, `setOpen` | `boolean`, `(open: boolean) => void` | Root state and a request to change it. |
| `platform` | `Platform \| undefined` | Explicit hotkey platform when present. |
| `select` | `(row: PaletteRow, secondary?: boolean) => void` | Clears input, requests close, touches recents and invokes the current callback. Secondary defaults to false and falls back to primary if absent. |

Use `CommandPaletteItem` for result selection and `CommandPaletteSecondary` for its alternate control; they also handle disabled state and events. Calling `select` yourself requires guarding your own control's disabled state. It does nothing while closed.

### Actions

`PaletteAction` describes a registered action or a row returned by `goBarGrammar`.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Identity; registering the same ID replaces the action. |
| `title` | `string` | Required | Row title and primary search text. |
| `run` | `() => void` | Required | Primary action. |
| `subtitle` | `string` | — | Muted text after the title; also searchable. |
| `scope` | `string` | Everywhere | Hotkey scope required to offer a registered action. Exposed as `row.badge`, with `panel:` removed. |
| `keywords` | `readonly string[]` | — | Additional search terms. |
| `group` | `string` | `labels.actions` | Heading for registered actions. An explicitly supplied group is also searchable. |
| `bindingId` | `string` | — | Hotkey binding whose current keys appear in `row.keys`. |
| `secondary` | `{ title: string; run: () => void }` | — | Alternate action and its hint text. |

Enter or a row click runs the primary action. Shift+Enter runs `secondary` when present, otherwise the primary action. `CommandPaletteSecondary` supplies a clickable hint on the highlighted row; callers choose its content and placement. Secondary actions replace the primary callback; repeat any shared work yourself.

A registered action with `scope: "panel:book"` is offered only when the palette opens from inside `<HotkeyScope scope="panel:book">`. It captures the scope before taking focus and keeps it for that opening. Grammar rows are not scope-filtered.

Matching is case-insensitive, and every query word must match. Each word scores highest for an exact title, followed by a title prefix, title word start, other title substring, metadata match, or letters in order within the title. Metadata includes the subtitle, group, ID, and keywords. `scorePaletteAction(action, query)` returns the combined score, `-1` for a miss, or `0` for an empty query. Registered actions are ranked, then collected under their group headings.

`createActionRegistry()` accepts an optional `{ maxRecents?: number }`; `maxRecents` defaults to `8`. Register panel actions on mount and use the returned function to remove them on unmount.

| Method | Input → output | Behavior |
|---|---|---|
| `register` | `PaletteAction \| readonly PaletteAction[]` → `() => void` | Adds or replaces actions by ID. Cleanup removes only the objects this call registered, leaving later replacements intact. |
| `list` | No input → `readonly PaletteAction[]` | Returns the action snapshot. Its reference stays stable between registry changes. |
| `recents` | No input → `readonly PaletteRecent[]` | Returns the recent snapshot, newest first; stable until recents change. |
| `touch` | `PaletteRecent` → `void` | Moves an entry to the front, deduplicates it, caps the list, and notifies both kinds of listener. |
| `loadRecents` | `readonly PaletteRecent[]` → `void` | Replaces recents, caps the list, and notifies subscribers without calling `onRecentsChange` listeners. |
| `onRecentsChange` | `(recents: readonly PaletteRecent[]) => void` → `() => void` | Subscribes to `touch` updates; returns cleanup. |
| `subscribe` | `() => void` → `() => void` | Subscribes to action and recent changes; returns cleanup. |

Palettes sharing a registry share its actions and recents. Each filters its own rows by query and captured scope.

### Symbols

`SymbolSearchAdapter` supplies the search; the component handles timing and cancellation.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `search` | `(query: string, signal: AbortSignal) => Promise<readonly SymbolResult[]>` | Required | Searches with the trimmed input and an abort signal. |
| `minLength` | `number` | `1` | Minimum query length before searching. |
| `debounceMs` | `number` | `150` | Delay in milliseconds before calling `search`. |

Query or adapter changes, closure and unmount cancel the pending debounce and abort the previous request. Reopening an inline list starts a fresh lookup. Answers from aborted requests are ignored even if the adapter resolves them, and results for another query are hidden. `loading` is true until the current adapter answers the qualifying query. A rejection or synchronous search error produces no symbol results. Supply searching and empty text through `CommandPaletteEmpty`.

| `SymbolResult` field | Type | Required | Display |
|---|---|---|---|
| `symbol` | `string` | Yes | Row title. |
| `name` | `string` | No | Subtitle. |
| `exchange` | `string` | No | Appended to the subtitle; part of the symbol's identity. |
| `kind` | `string` | No | Asset-class or instrument-type badge. |

### Recents

An empty query supplies eligible recents before the registered actions. Callers choose how many to render; the examples use `group.rows.slice(0, 5)` for the recent group. Missing or out-of-scope actions are skipped. Registered actions still appear in their usual groups too.

`PaletteRecent` is `{ kind: "action"; id: string }` or `{ kind: "symbol"; symbol: SymbolResult }`. `touch` deduplicates actions by ID and symbols by symbol plus exchange. Grammar rows do not enter recents.

Selecting a row clears the input and requests closure, then updates recents when applicable, then invokes the action callback. This applies to primary and secondary actions. Persistence is yours: save through `onRecentsChange` and restore with `loadRecents`.

### Hotkeys

| Variant | Binding ID | Default keys | Scope | Effect |
|---|---|---|---|---|
| `palette` | `palette.open` | `mod+k` | `editing` | Toggles the dialog, including while typing. |
| `go-bar` | `go-bar.focus` | `/` | `global` | Focuses the inline input outside typing contexts. |

`HotkeysProvider` supplies and attaches the registry. Pass `hotkeys={registry}` to use one directly; attach its dispatcher yourself. See [useHotkeys](use-hotkeys.md) for registry setup and scope rules.

If the binding ID already exists, its keys and wording remain yours; the component only attaches its handler. Otherwise it declares the binding and removes it on unmount. `hotkey="mod+p"` changes the default keys. `hotkey={false}` disables the opening or focus binding but keeps row shortcuts; `hotkeys={null}` disables both.

Row shortcuts follow the current keys for `bindingId`, including remaps. The dispatcher stops at dialogs. A single-step opening shortcut also closes the palette from inside; use Escape for a multi-step binding.

Dialog focus can arrive after opening. For up to one second, or until focus reaches the palette, it captures keys outside itself: text without Ctrl, Meta, or Alt enters the query, Enter and Shift+Enter run the highlighted row, and Escape requests closure. Those events do not reach the hotkey dispatcher. Composition events are left alone.

### Go-bar

Both variants use the same action, search, and recent APIs.

| Behavior | `palette` | `go-bar` |
|---|---|---|
| Layout | Dialog | Always-visible input with a dropdown |
| `open` controls | Dialog visibility | Dropdown visibility |
| Focus | Dialog handles focus | Input focus requests opening; focus leaving the root requests closure |
| Selection | Clears the query and requests closure | Also blurs the input |
| Escape | Requests closure | Clears the query, requests closure, and blurs the input |

`goBarGrammar` receives trimmed, nonempty input and returns command rows before registered actions and symbol results. It runs synchronously in either variant. The first row is initially selected; Enter runs the highlighted row. See [Inline commands](#inline-commands) for a complete grammar. `AAPL` offers every function in that example, `AAPL G` narrows to `AAPL GP`, and Enter runs it without waiting for symbol search.

### The rest

`labels` accepts any of these string overrides. The title names the command interface in both variants; the dialog also receives the description. The underlying `command` supplies keyboard navigation and combobox/listbox semantics.

| Label | Dialog default | Go-bar default |
|---|---|---|
| `title` | `Command palette` | `Command line` |
| `description` | `Search for a command or a symbol` | Same |
| `placeholder` | `Type a command or a symbol…` | `Symbol, function, or command` |
| `recent` | `Recent` | Same |
| `actions` | `Actions` | Same |
| `commands` | `Commands` | Same |
| `symbols` | `Symbols` | Same |
| `hotkey` | `Open the command palette` | `Focus the command line` |

`cmdk` arrives with your shadcn `command` component. The palette handles its own filtering and ordering to combine registered actions, grammar rows, and asynchronous symbols.

### What it does not do

Nested pages, symbol lookup, symbol meaning and recent persistence belong to your application. Add surrounding content or a preview pane in your own layout. The component does not virtualize results.
