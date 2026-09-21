# command-palette

`npx shadcn add tradecn/ui/command-palette` puts `command-palette.tsx` in your `ui` alias, the hotkey registry (`use-hotkeys.tsx`, `hotkeys.ts`) in your `hooks` and `lib` aliases, and brings your own `command`, `kbd`, and `badge` if you do not have them. Dependency: `cn`. `cmdk` arrives with your `command` component, not with this one.

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

## Actions

An action is `{ id, title, subtitle?, scope?, keywords?, group?, bindingId?, run, secondary? }`. The registry is a list with a subscription, so panels can register their actions when they mount and take them back when they leave; `register` returns the unregister. Every palette reading one registry shows the same rows.

Enter runs the row. Shift+Enter runs `secondary`, and the hint for it (`⇧ ↵ Sell instead`) shows on the highlighted row, where someone will find it, and can be clicked. A row without a second action runs its first on Shift+Enter.

`scope` is a hotkey scope. An action with `scope: "panel:book"` is on offer only when the palette was opened with focus inside `<HotkeyScope scope="panel:book">`, and the row says so with a badge. The palette reads where focus was before it took focus for itself.

The palette does its own filtering and ordering instead of leaving it to `cmdk`, because three sources land in one list and one of them is asynchronous. Every word of the query has to land somewhere: the start of the title beats the inside of it, which beats a keyword, the group, or the id, which beats letters in order. `scorePaletteAction(action, query)` is that ranking as a pure function.

## Symbols

`symbols` is an adapter with one method, `search(query, signal)`. The palette debounces, aborts the request in flight when the query moves on, and shows only answers to the query on screen: a row left over from three letters ago is how the wrong symbol gets loaded. While a search is out and nothing else matches, the list says so. A rejected search is no results. `SymbolResult` is `{ symbol, name?, exchange?, kind? }`; `kind` renders as a badge.

## Recents

On an empty query the last things run come first, actions and symbols both. They live in the action registry, so both variants share them. Persistence is yours: `onRecentsChange` fires after a run and `loadRecents` puts them back. A recent whose action is gone is skipped.

## Hotkeys

Inside a `HotkeysProvider` the palette declares `palette.open` on `mod+k` in the `editing` scope, so it opens while you type, and removes it on unmount. The shortcut on a row is whatever the hotkey registry currently holds for the action's `bindingId`, so a `remap` shows up without anyone telling the palette. If you declared `palette.open` yourself, your keys and wording stand and the palette only attaches its handler. `hotkey="mod+p"` changes the default, `hotkey={false}` declares nothing, `hotkeys={registry}` passes one without a provider, and `hotkeys={null}` opts out.

The dispatcher stops at a dialog, so the palette answers its own key from inside to close.

Radix focuses a dialog in the commit that mounts it. Base UI does it about 10 ms later (headless Chromium, production build, Apple M5 Max, 2026-09-20), and under a busy main thread that gap is longer. Keys typed in it land on the body, where a single-key hotkey would take them. Someone who pressed `mod+k` is already working the palette, so until focus arrives its keys are the palette's: text goes into the query, Enter and Shift+Enter run the highlighted row, Escape closes, and none of them reach the dispatcher. The browser matrix types and presses Shift+Enter the instant the dialog appears, in all three styles, to keep it that way.

## Go-bar

`variant="go-bar"` is the same registry, rows, and recents rendered inline: an input with the rows dropping below it while it has focus. It declares `go-bar.focus` on `/`. Escape clears and leaves.

`goBarGrammar` turns what has been typed into rows, and the first row is what Enter runs. It is a function from the input to actions, so the grammar is yours:

```ts
const grammar = (input: string): PaletteAction[] => {
  const [symbol, fn = ""] = input.toUpperCase().split(/\s+/)
  if (!isSymbol(symbol)) return []
  return FUNCTIONS.filter((f) => f.code.startsWith(fn)).map((f) => ({ id: `${symbol}.${f.code}`, title: `${symbol} ${f.code}`, subtitle: f.title, run: () => open(symbol, f.code) }))
}
```

`AAPL` offers every function, `AAPL G` narrows to `AAPL GP`, Enter runs it. The grammar needs no request, so it answers before the symbol search does. It applies in the dialog too.

## The rest

`open`, `defaultOpen`, and `onOpenChange` control the dialog. `className` lands on the dialog's content (width, say) or on the go-bar's root. `labels` replaces any of the strings: title, description, placeholder, empty, searching, the group headings, and the binding's description.

## What it does not do

Nested pages, a preview pane, or fetching. It does not persist recents and it does not know what a symbol is.
