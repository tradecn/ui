# Watchlist

Composable add controls, removal actions, and a virtual price grid.

## Usage

```tsx
import { useMemo, useState } from "react"
import { ContextMenuSeparator } from "@/components/ui/context-menu"
import { createRowStore } from "@/lib/row-store"
import { Watchlist, WatchlistGrid, WatchlistAddForm, WatchlistAddInput, WatchlistAddButton, WatchlistAddStatus, WatchlistRemoveMenuItem, watchlistColumns, watchlistRemoveColumn, type WatchlistGridProps, type WatchlistRow } from "@/components/ui/watchlist"

export function WatchlistAddControls() {
  return <WatchlistAddForm><WatchlistAddInput /><WatchlistAddButton /><WatchlistAddStatus /></WatchlistAddForm>
}

export function RemovableWatchlistGrid<T extends WatchlistRow>({ columns, price, renderContextMenu, ...props }: WatchlistGridProps<T>) {
  const all = useMemo(() => [...(columns ?? watchlistColumns<T>({ price })), watchlistRemoveColumn<T>()], [columns, price])
  return <WatchlistGrid {...props} columns={all} renderContextMenu={(rows, ids, target) => <>
    {renderContextMenu?.(rows, ids, target)}
    {renderContextMenu && <ContextMenuSeparator />}
    <WatchlistRemoveMenuItem ids={ids} />
  </>} />
}

const quotes: WatchlistRow[] = [
  { symbol: "ES", last: 5012.25, bid: 5012, ask: 5012.5, change: -12.5, changePct: -0.25, volume: 980_000 },
  { symbol: "CL", last: 78.1, bid: 78.09, ask: 78.11, change: 0.25, changePct: 0.32, volume: 125_000 },
  { symbol: "GC", last: 2380.4, bid: 2380.3, ask: 2380.5, change: 0, changePct: 0, volume: 42_000 },
]

export default function WatchlistDemo() {
  const [store] = useState(() => {
    const store = createRowStore<WatchlistRow>({ getRowId: (row) => row.symbol })
    store.applyDeltas({ upsert: quotes.slice(0, 2) })
    return store
  })
  const [activated, setActivated] = useState<string | null>(null)
  const add = (symbol: string) => {
    const quote = quotes.find((row) => row.symbol === symbol)
    if (quote) store.applyDeltas({ upsert: [quote] })
  }
  return (
    <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <div className="h-48">
        <Watchlist store={store} validate={(symbol) => quotes.some((row) => row.symbol === symbol)} onAdd={add} onRemove={(symbols) => store.applyDeltas({ remove: symbols })}>
          <WatchlistAddControls />
          <RemovableWatchlistGrid label="Market watchlist" onRowActivate={(row) => setActivated(row.symbol)} />
        </Watchlist>
      </div>
      <p role="status" className="text-muted-foreground">{activated ? `Last activated: ${activated}.` : "Nothing activated."}</p>
    </div>
  )
}
```

The example accepts ES, CL and GC. Add a symbol with Enter or the Add button. With the grid focused, press Delete to remove the selection or Enter to activate a row. Use a row's hover button or context menu to remove it, or double-click plain cell content to activate it. Custom controls retain their own [pointer interactions](data-grid.md#pointer-interactions).

`WatchlistAddControls` and `RemovableWatchlistGrid` are application recipes built from the public parts. Save Usage as `watchlist.tsx` beside examples that import these recipes, outside `components/ui` so the installed component keeps its own file.

## Composition

Use the following composition to build a `Watchlist`:

```text
Watchlist
├── WatchlistAddForm
│   ├── WatchlistAddInput
│   └── WatchlistAddButton
├── WatchlistGrid
│   ├── watchlistColumns
│   ├── watchlistRemoveColumn → WatchlistRemoveButton
│   └── renderContextMenu → WatchlistRemoveMenuItem
└── Application content
```

Choose the controls, columns and menu content at the call site. Use `useWatchlist` for selection and commands, and `useWatchlistAdd` inside an add form to replace its input or button.

## Prices by instrument

Use a stable `price` function to print ZN in 32nds and ES in decimals. Change and percentage change keep their signed decimal formats.

<!-- demo: watchlist-prices -->

## Trend column

Install [sparkline](sparkline.md) alongside watchlist, then append a custom cell to the symbol and last columns. Each row supplies fixed readings and a previous close; the inert charts preserve the grid's keyboard controls.

<!-- demo: watchlist-trends -->

## Custom layout

Place a native select beside the grid and bulk removal below it. The select shares add and duplicate-selection behavior; GC demonstrates a missing price.

<!-- demo: watchlist-layout -->

## API Reference

### Watchlist

`Watchlist<T>` coordinates the store, selection, focus and commands. It accepts native `div` props, events, classes and a ref. `T` extends `WatchlistRow`; row ids are strings. Give its grid a container with a height.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Rows keyed by `symbol`. |
| `children` | `ReactNode` | Required | Controls, grid and application content, including conditional content. |
| `onAdd` | `(symbol: string) => void` | None | Receive add requests; enables add commands. |
| `onRemove` | `(symbols: RowId[]) => void` | None | Receive removal requests; enables removal commands and grid deletion keys. |
| `normalize` | `(raw: string) => string` | Trim and uppercase | Normalize input before lookup and validation. |
| `validate` | `(symbol: string) => boolean` | None | Synchronously accept or reject a new symbol. |
| `selection` | `ReadonlySet<RowId>` | Internal empty set | Control selected rows. |
| `onSelectionChange` | `(selection: ReadonlySet<RowId>) => void` | None | Receive grid and duplicate-add selection requests. |
| `focusedRowId` | `RowId \| null` | Internal `null` | Control the focused row. |
| `onFocusedRowChange` | `(id: RowId \| null) => void` | None | Receive grid and duplicate-add focus requests. |
| `className` | `string` | None | Classes on the outer `tradecn-watchlist` container. |

Apply callbacks when controlling selection or focus. With internal state, callbacks still receive changes.

### WatchlistGrid

`WatchlistGrid<T>` supplies the `watchlist` preset: 22 px rows, single selection, fill flashes, and no reorder hold, arrival highlight, viewport pinning or row-count announcements. Individual grid options can override preset defaults.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `columns` | `ColumnDef<T>[]` | `watchlistColumns({ price })` | Choose columns and their order. |
| `price` | `(value: number, row: T) => string` | Two decimals | Format default last, bid and ask cells; unused with explicit columns. |
| `label` | `string` | `"Watchlist"` | Accessible name of the grid. |
| `getRowProps` | `(row: T, id: RowId) => RowDecoration \| undefined` | None | Row decoration, merged with `group/row`. Memoize it: the wrapper follows your function, so a new one re-renders every row and a memoized one is free. |
| `getRowLabel` | `((row: T, id: RowId) => string) \| null` | The symbol | A row's name that holds while its prices tick. The grid reads the focused row's cells once when focus rests on it, and `null` names rows by their cells and reads nothing. Keep its identity stable. |
| `renderContextMenu` | `(rows: T[], ids: RowId[], target?: RowId \| null) => ReactNode` | None | Complete menu content, including any removal action; `target` is the row the menu opened on. |
| `className` | `string` | None | Classes on the grid's sizing wrapper. |
| `ref` | `Ref<HTMLDivElement>` | None | Ref to the sizing wrapper. |
| `onKeyDown` | `(event: KeyboardEvent<HTMLDivElement>) => void` | None | Runs before removal keys; prevent the event to cancel removal. |

Other [data-grid](data-grid.md) options pass through, including sorting, column state, filtering, editing and row activation. Store, preset, selection and row focus come from the Watchlist composition. Use the same row type on the root and grid when supplying custom columns.

### Add controls

`WatchlistAddForm` requires children and accepts native form props and a ref. Its `onSubmit` runs first and can prevent submission. Each form owns an independent draft and invalid state.

`WatchlistAddInput` binds the installed Input to that draft. It accepts native input props, a ref, classes and a cancellable `onChange`; `value`, `defaultValue` and `aria-invalid` are reserved for the form. `placeholder` defaults to `"Add symbol"` and supplies the default accessible name; set `aria-label` or `aria-labelledby` when another name is needed. Omitting `onAdd` disables the input.

`WatchlistAddButton` accepts the installed Button's props and ref. It defaults to a compact submit button with an outline style and `Add` text. An explicit `size` uses the installed Button’s dimensions; `className` can override either. It is disabled when adding is unavailable or the draft is blank. Supply children to change its text.

`WatchlistAddStatus` says what the last add came to in a polite live region, and the input points to it while it holds words: `Adding ZN` for a request `onAdd` takes, since the row shows only when your store has it, `ZN is already listed`, which also moves focus to that row and brings it into view, or `ZN can't be added` for a symbol `validate` refuses, beside the input's invalid mark. Pass `added`, `listed`, and `refused`, each a function of the symbol, for your own words. Typing again clears it.

### Removal controls

`WatchlistRemoveButton` accepts native button props and a ref. `WatchlistRemoveMenuItem` accepts the installed ContextMenuItem's props and ref. Both require `ids: readonly RowId[]`, default their text to `Remove SYMBOL` or `Remove N`, and accept custom children. They are disabled without `onRemove` or ids. Their `onClick` runs first and can prevent removal.

Add `watchlistRemoveColumn<T>()` to your columns for the ordinary hover button, and place `WatchlistRemoveMenuItem` in your menu renderer for the ordinary menu action. The Usage recipe includes both.

### Hooks

`useWatchlist()` shares selection, focus and commands without subscribing to the row store.

| Member | Type | Purpose |
|---|---|---|
| `selection`, `focusedRowId` | `ReadonlySet<RowId>`, `RowId \| null` | Current selection and focus. |
| `targets` | `readonly RowId[]` | Selection, or the focused row when selection is empty. |
| `select`, `focus` | `(selection: ReadonlySet<RowId>) => void`, `(id: RowId \| null) => void` | Request selection or focus changes. |
| `canAdd`, `canRemove` | `boolean` | Whether the corresponding callback exists. |
| `add` | `(raw: string) => boolean` | Normalize, select a duplicate or request an addition; false means refused. |
| `remove` | `(ids: readonly RowId[]) => void` | Request removal of explicit ids without editing the store. |

`useWatchlistAdd()` must be inside `WatchlistAddForm`. It returns `draft`, `invalid`, `canAdd`, `canSubmit`, `setDraft(text)` and `submit()`. Custom controls supply their own labels and bind their value and invalid state to these readings. `submit()` uses the current rendered draft; use `useWatchlist().add(raw)` for a direct request.

### The list is yours

`Watchlist` does not keep the list, fetch it, or decide what belongs on it. `onAdd(symbol)` and `onRemove(symbols)` say what was asked for; the rows are whatever is in the store you pass. A symbol shows up when your feed upserts it and leaves when you remove it. The root renders only its children. Omit optional parts to hide them; omitting a callback disables its public controls and commands.

Rows are keyed by `symbol`, so create the store with `getRowId: (r) => r.symbol`.

| `WatchlistRow` field | Type | Required | Meaning |
|---|---|---|---|
| `symbol` | `string` | Yes | Store row id and displayed symbol. |
| `name` | `string` | No | Available to custom columns; not displayed by default. |
| `last`, `bid`, `ask` | `number \| null` | No | Prices passed to the price formatter. |
| `change` | `number \| null` | No | Price change against the previous close. |
| `changePct` | `number \| null` | No | Percentage value: `1.25` displays as `+1.25%`. |
| `volume` | `number \| null` | No | Volume, displayed with compact suffixes such as `1.25M`. |

### Columns

`watchlistColumns<T>(options?: WatchlistColumnOptions<T>): ColumnDef<T>[]` accepts an optional `price` callback with the signature above. It returns symbol (frozen left), last, bid, ask, change, change %, and volume. Spread the result into your own list to add a column, drop one, or reorder; frozen columns stay first.

The [trend-column example](#trend-column) shows a complete custom-column composition and names its additional installation.

`price` gets the row because instruments differ: one prints in 32nds and the next in decimals. Missing numeric values display `NULL_TOKEN` (`–`). Change and change % use their own signed, two-decimal formatters (`+0.25`, `−12.50`, `−0.25%`) and sign-based colors, with zero flat. The price callback does not format these changes. Last, bid, and ask flash on change; change, change %, and volume do not.

Keep `columns` and `price` stable with a module constant, `useMemo`, or `useCallback`. Changing either rebuilds the column list and can re-render rows.

### Adding

Type a symbol and press Enter, or click Add. Whitespace-only input is ignored before `normalize` runs. The default normalizer trims and uppercases; supply your own where case matters. If normalization returns an empty string, the field clears without an add request.

An existing symbol is looked up in the whole store before validation. Watchlist requests selection and row focus for that symbol, clears the field, and skips `validate` and `onAdd`. Controlled selection and focus need their callbacks applied. This changes grid state; it does not move keyboard focus into the grid or scroll the row into view.

For a new symbol, `validate` returning false preserves the typed text and marks the field `aria-invalid` until the text changes or a later submission succeeds. Validation is synchronous. On acceptance, Watchlist calls `onAdd` and clears the field when the callback returns; it does not await a returned promise or handle its rejection. Handle asynchronous lookup and errors in the application.

Submitting with Enter leaves focus in the input for the next symbol. Clicking Add does not explicitly restore input focus.

### Removing

Focus the grid itself, then press Delete or Backspace to request removal of the selection, or the focused row when nothing is selected, once per press: a held key's repeats remove nothing more. Focus then goes to the row now at the removed row's place, so the next Delete asks for that one. `onRemove` hears only symbols the store still holds, so a selection you haven't pruned asks for nothing twice, and the remove column's button takes no focus from a pointer press, so focus stays where it was when its row goes. It does nothing without `onRemove`, without a target, or when the event was already prevented. Keys from cell editors, custom controls, header controls, selection checkboxes, nested grids and portaled content do not request removal. `WatchlistGrid` still passes their bubbling events to your `onKeyDown` handler.

`watchlistRemoveColumn` adds a `×` that shows on hover and requests removal of only that row. Buttons, menu items and grid deletion keys call `onRemove` with symbols; none changes the store.

The grid passes the current selection to your menu renderer, or with nothing selected the row the menu opened on, which it keeps while the menu stays open, even after that row leaves. Right-clicking plain row content requests focus for that row and, when selection is enabled, replaces the selection if that row was not already selected. Apply these requests when controlling selection or focus; until then, a selection that doesn't hold the row stays what the menu acts on.

The `×` is out of the tab order on purpose. The grid itself and its header controls have separate tab stops.

Focus the grid itself for arrow-key navigation and Delete; see [DataGrid keyboard](data-grid.md#keyboard) for returning from a control. In the add field, Delete and Backspace edit text and remove nothing.

### What it costs

The add form keeps its own state, so typing re-renders its controls without re-rendering grid rows. Selection, focus and removal callbacks use stable commands. The `getRowProps` wrapper follows your function: memoize it and memoized rows skip re-rendering across unrelated re-renders, hand in a new one and the decoration reaches rows already on screen. `renderContextMenu` runs with current props and is not passed to memoized rows. The root adds no store subscriptions or timers; the grid owns its subscriptions and cleanup.

With stable grid inputs, a value update that leaves view membership and order unchanged re-renders only the affected visible row. The watchlist tests count cell renders during typing, parent renders, and a single-row update.

### What it does not do

Persist the list, fetch quotes, group or nest symbols, or draw a chart. It has no notion of several lists; render several `Watchlist`s over several stores.
