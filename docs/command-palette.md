# CommandPalette

Search registered actions and symbols in a dialog or inline command line, with shared recents and live shortcuts from the hotkey registry. Built on your shadcn `command` component.

## Usage

```tsx
import { CommandPalette, createActionRegistry } from "@/components/ui/command-palette"
import { HotkeysProvider } from "@/hooks/use-hotkeys"
```

```tsx
const actions = createActionRegistry()
actions.register([
  { id: "go.blotter", title: "Go to blotter", group: "Go", bindingId: "go.blotter", run: () => navigate("/blotter") },
  { id: "ticket.buy", title: "New buy ticket", group: "Trade", run: openBuy, secondary: { title: "Sell instead", run: openSell } },
  { id: "book.cancel", title: "Cancel selected order", scope: "panel:book", bindingId: "book.cancel", run: cancelSelected },
])

<HotkeysProvider bindings={BINDINGS}>
  <CommandPalette
    actions={actions}
    symbols={{ search: (q, signal) => api.search(q, { signal }), minLength: 1, debounceMs: 150 }}
    onSymbolSelect={(s) => load(s.symbol)}
    symbolSecondary={{ title: "Load and watch", run: (s) => { load(s.symbol); watch(s.symbol) } }}
  />
</HotkeysProvider>
```

## API Reference

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `actions` | `ActionRegistry` | Required | Registry created by `createActionRegistry()`. |
| `variant` | `"palette" \| "go-bar"` | `"palette"` | Dialog or inline input with a dropdown. |
| `open` | `boolean` | Uncontrolled | Controls the dialog or go-bar dropdown. |
| `defaultOpen` | `boolean` | `false` | Initial open state when uncontrolled. |
| `onOpenChange` | `(open: boolean) => void` | — | Receives requested open-state changes in either mode. |
| `symbols` | `SymbolSearchAdapter` | — | Supplies asynchronous symbol results. |
| `onSymbolSelect` | `(symbol: SymbolResult) => void` | — | Runs for a symbol's primary selection. |
| `symbolSecondary` | `{ title: string; run: (symbol: SymbolResult) => void }` | — | Alternate symbol action; does not call `onSymbolSelect`. |
| `goBarGrammar` | `(input: string) => readonly PaletteAction[]` | — | Synchronous command rows for nonempty input, in either variant. |
| `hotkeys` | `HotkeyRegistry \| null` | Nearest `HotkeysProvider`, or `null` | Supplies bindings and row shortcuts; `null` opts out. |
| `hotkey` | `string \| false` | `"mod+k"` or `"/"` by variant | Default opening or focus binding; `false` disables its registration and handler. |
| `labels` | `Partial<CommandPaletteLabels>` | See The rest | Overrides accessible names, messages, headings, and binding text. |
| `className` | `string` | — | Styles the dialog content or go-bar root. |

When `open` is supplied, update it in `onOpenChange` to accept requests to open or close. Without it, the component manages that state.

### Actions

`PaletteAction` describes a registered action or a row returned by `goBarGrammar`.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Identity; registering the same ID replaces the action. |
| `title` | `string` | Required | Row title and primary search text. |
| `run` | `() => void` | Required | Primary action. |
| `subtitle` | `string` | — | Muted text after the title; also searchable. |
| `scope` | `string` | Everywhere | Hotkey scope required to offer a registered action. Renders as a badge, with `panel:` removed. |
| `keywords` | `readonly string[]` | — | Additional search terms. |
| `group` | `string` | `labels.actions` | Heading for registered actions. An explicitly supplied group is also searchable. |
| `bindingId` | `string` | — | Hotkey binding whose current keys appear on the row. |
| `secondary` | `{ title: string; run: () => void }` | — | Alternate action and its hint text. |

Enter or a row click runs the primary action. Shift+Enter runs `secondary` when present, otherwise the primary action. The secondary hint appears on the highlighted row and can be clicked. Secondary actions replace the primary callback; repeat any shared work yourself.

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

Query changes cancel the pending debounce and abort the previous request. Answers from aborted requests are ignored even if the adapter resolves them, and results for another query are hidden. When a qualifying query has no current answer, the empty list shows `labels.searching`. A rejected promise produces no symbol results.

| `SymbolResult` field | Type | Required | Display |
|---|---|---|---|
| `symbol` | `string` | Yes | Row title. |
| `name` | `string` | No | Subtitle. |
| `exchange` | `string` | No | Appended to the subtitle; part of the symbol's identity. |
| `kind` | `string` | No | Asset-class or instrument-type badge. |

### Recents

An empty query shows up to five recents before the registered actions. Missing or out-of-scope actions are skipped. Registered actions still appear in their usual groups too.

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

`goBarGrammar` receives trimmed, nonempty input and returns command rows before registered actions and symbol results. It runs synchronously in either variant. The first row is initially selected; Enter runs the highlighted row. Supply your own grammar:

```ts
const grammar = (input: string): PaletteAction[] => {
  const [symbol, fn = ""] = input.toUpperCase().split(/\s+/)
  if (!isSymbol(symbol)) return []
  return FUNCTIONS.filter((f) => f.code.startsWith(fn)).map((f) => ({ id: `${symbol}.${f.code}`, title: `${symbol} ${f.code}`, subtitle: f.title, run: () => open(symbol, f.code) }))
}
```

Pass this as `goBarGrammar={grammar}`. `AAPL` offers every function, `AAPL G` narrows to `AAPL GP`, and Enter runs it without waiting for symbol search.

### The rest

`labels` accepts any of these string overrides. The title names the command interface in both variants; the dialog also receives the description. The underlying `command` supplies keyboard navigation and combobox/listbox semantics.

| Label | Dialog default | Go-bar default |
|---|---|---|
| `title` | `Command palette` | `Command line` |
| `description` | `Search for a command or a symbol` | Same |
| `placeholder` | `Type a command or a symbol…` | `Symbol, function, or command` |
| `empty` | `No results` | Same |
| `searching` | `Searching…` | Same |
| `recent` | `Recent` | Same |
| `actions` | `Actions` | Same |
| `commands` | `Commands` | Same |
| `symbols` | `Symbols` | Same |
| `hotkey` | `Open the command palette` | `Focus the command line` |

`cmdk` arrives with your shadcn `command` component. The palette handles its own filtering and ordering to combine registered actions, grammar rows, and asynchronous symbols.

### What it does not do

No nested pages or preview pane. Symbol lookup, symbol meaning, and recent persistence belong to your application.
