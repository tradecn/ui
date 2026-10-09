# QuotePanel

Edit a market maker's bid, ask, skew, width, and sizes beside the market's two-way. Each instrument has one row, with the server's status and allowed actions.

## Usage

Seed a stable store and include `"edit"` in each editable row's `allowedActions`. Double-click a value or press Enter on its cell to edit; Enter commits and Escape cancels. Prices use 32nds, skew and width use quote steps, and sizes use whole units. Scroll horizontally to reach the remaining columns.

This example writes each edit straight back to the store. In an application, send the command to your server and apply its response; the server decides any related changes to bid, ask, skew, or width. The panel never derives those values or writes the store itself.

```tsx
import { useState } from "react"
import { QuotePanel, type QuoteRow } from "@/components/quote-panel"
import type { InstrumentConvention } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"

const convention: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const quotes: QuoteRow[] = [
  { id: "2Y", instrument: "2Y Treasury", status: "Quoting", marketBid: 100.234375, marketAsk: 100.25, bid: 100.21875, ask: 100.265625, skew: 0, width: 3, bidSize: 5_000_000, askSize: 5_000_000, allowedActions: ["edit"] },
  { id: "10Y", instrument: "10Y Treasury", status: "Quoting", marketBid: 99.515625, marketAsk: 99.53125, bid: 99.5, ask: 99.5625, skew: 0.5, width: 4, bidSize: 10_000_000, askSize: 10_000_000, allowedActions: ["edit"] },
]

export default function QuotePanelDemo() {
  const [store] = useState(() => {
    const store = createRowStore<QuoteRow>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: quotes })
    return store
  })
  return (
    <div className="h-40 w-fit max-w-full">
      <QuotePanel store={store} convention={convention} onEdit={({ rowId, key, value }) => {
        store.applyDeltas({ patch: [{ id: rowId, fields: { [key]: value } }] })
      }} />
    </div>
  )
}
```

## Pending and rejected edits

Return a promise from `onEdit` when the server can reject a command. This example waits one second before writing the accepted value and resolving. Set Width to `5` to see it pending, then to `9` to see a rejection: the cell returns to the stored value and shows the error. Reopen it and commit a change to replace the error. The delay is sample server behavior; outstanding timers are cleared on unmount.

<!-- demo: quote-panel-pending -->

## Allowed actions

The server's `allowedActions` controls both editing and which row buttons appear. Pause keeps the levels, Pull clears them and removes edit permission, and Resume restores a two-way from the market. These handlers write the status and permissions back to the store so the result stays visible. The unrelated columns start hidden so the row actions stay in view.

Pull all asks for a second, separate press, then receives every row that allows `"pull"`, including rows outside a filter or selection. After all rows are pulled, it is disabled; Resume makes a row eligible again. Escape or another click inside the panel cancels the question.

<!-- demo: quote-panel-actions -->

## Confirming and blocking edits

Pass `limits` to check a value before `onEdit` runs. Try Bid `100-04`: it is seven ticks below the market bid, past the four-tick limit, so the editor asks for confirmation. Press Enter again to send it. A crossed quote is refused before limits are checked.

In Bid size, `60000000` asks for confirmation above 50 million; `150000000` is blocked above 100 million. Skew, width, and blank values bypass these limits. The [Limits reference](#limits) explains when a question stands and what withdraws it.

<!-- demo: quote-panel-limits -->

## API Reference

`QuotePanel` uses [`data-grid`](data-grid.md) in its `parameters` preset with generated quote columns and an optional Pull all button. Shared files are byte-identical to the ones `data-grid` and `parameter-grid` install. Though it installs as a block in your `components` alias, compose it through `quotePanelColumns` and its options rather than editing the file: unlike the ticket blocks, its behavior lives in the generated columns, and an edited file takes later registry fixes by hand. A two-way edit is refused when it crosses the desk's other side, read through the instrument's quote direction — a bid at or above the ask normally, the reverse where a higher quote means a lower price: yield and discount by default, any basis the convention declares with `quoteInverted`, and `quoteInverted: false` keeps the plain reading on a desk that quotes bid below offer in those bases.

### Props

`QuotePanelProps<T>` requires `T extends QuoteRow`. It inherits [`DataGridProps<T>`](data-grid.md) except `preset`, `columns`, `label`, and `onEdit`; the latter three have the definitions below. Other inherited props, including views, sorting, selection, column state, and preset overrides such as `rowHeight`, pass to the grid. `className` styles the panel's outer wrapper.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Quotes keyed by their `id`. |
| `convention` | `InstrumentConvention \| ((row: T) => InstrumentConvention)` | Required | How levels print, parse, and step: one convention for every row, or one per row. |
| `onEdit` | `(change: EditChange<T>) => void \| Promise<unknown>` | Required | Send a typed level, size, skew, or width to the server. |
| `actions` | `readonly QuoteAction<T>[]` | None | The row's buttons, shown where `allowedActions` names them. |
| `onPullAll` | `(rows: T[]) => void \| Promise<unknown>` | None | Show Pull all; receive every row the server allows the pull action on. |
| `pullAction` | `string` | `"pull"` | The id Pull all looks for in `allowedActions`. |
| `editAction` | `string` | `"edit"` | The id that lets a row's values be typed. |
| `limits` | `Limits \| ((row: T) => Limits \| undefined)` | None | Checks for bid, ask, and size edits. |
| `font` | `"numeric" \| "mono"` | See below | Font family for the market and desk bid/ask columns. |
| `columns` | `ColumnDef<T>[] \| ((question: QuotePanelQuestion) => ColumnDef<T>[])` | `quotePanelColumns(options)` | Replace the generated column list. A function keeps the panel's question line; see [Columns](#columns). |
| `label` | `string` | `"Quotes"` | Accessible name for the grid. |
| `labels` | `Partial<QuotePanelLabels>` | `DEFAULT_QUOTE_PANEL_LABELS` | Override the words listed below. |
| `className` | `string` | None | Classes on the outer wrapper. |

Keep `labels`, `actions`, `limits`, and a fixed `convention` stable between renders: a new object rebuilds every generated column.

With a fixed convention, `font` defaults to `"mono"` for fractional quotes in the price basis and `"numeric"` otherwise. A function-valued `convention` always defaults to `"numeric"`, even when it returns fractional price conventions; pass `font="mono"` to override it.

### Rows

Extend `QuoteRow` with whatever else your server sends:

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | `string` | Yes | Row identity; use it in the store's `getRowId`. |
| `instrument` | `string` | Yes | The frozen first column. |
| `status` | `string` | Yes | The server's word: `Quoting`, `Paused`, `Pulled`, whatever it says. Printed as is, on `data-quote-status`. |
| `marketBid` / `marketAsk` | `number \| null` | No | The market's two-way. These flash as they move. |
| `bid` / `ask` | `number \| null` | No | The desk's two-way. Null on a side is no level there. |
| `skew` | `number \| null` | No | How far the desk's mid sits off the market's, in quote steps, signed. |
| `width` | `number \| null` | No | From the desk's bid to its ask, in quote steps. |
| `bidSize` / `askSize` | `number \| null` | No | The size shown on each side. |
| `allowedActions` | `readonly string[]` | No | The ids the server allows now. An absent or empty list permits nothing. |
| `updatedAt` | `number \| null` | No | When the server last changed the row; unused by the generated columns. |

A quote step is `tick` for a price basis. For yield, discount, or spread, it is `quoteStep` or the basis default from [`format`](format.md): `0.001`, `0.001`, or `0.1`, respectively.

### Every edit is a command

With the generated columns, Enter, F2, a double click, or typing opens a cell when the row's `allowedActions` includes `editAction`. Enter commits; Escape cancels; Tab and Shift+Tab commit and move to the next or previous editable cell in the row. Up and Down step, with Shift for ten steps. Leaving the editor also commits a valid value, or discards a value that fails parsing or validation.

Bid and ask read the instrument's notation through [`format`](format.md)'s `parseQuote`. Sizes read whole numbers with commas only between thousands, as they print (`5,000,000`). Skew and width read decimals, so one comma with no point after it, as in `1,234`, could be a decimal comma and is not a number; neither is `1,5`. Their editor opens on text without separators, `1234`, and a pending value shows that text until the store settles.

A valid change calls `onEdit` with `{ rowId, key, value, previous, row }`. The generated keys are `bid`, `ask`, `skew`, `width`, `bidSize`, and `askSize`; `previous` and `row` come from the current store. Committing the same value sends nothing. The panel never writes the store.

The cell shows the committed value as pending until the store matches it (`Object.is`) or your promise resolves. Resolution displays the current store value, which may still be the old value. Returning nothing leaves the cell pending until the store matches. Reopening starts from the committed text. A promise-backed pending is covered: every close of the untouched editor — Enter, Tab, blur, or Escape — restores it, a promise that settled meanwhile applied, and committing a change replaces it. A pending from returning nothing has no promise to settle it, so reopening dismisses it. A thrown error or rejection of a still-pending promise displays the current store value and the error message; reopening clears the error while the editor is open, and closing it untouched brings the error back.

| Field | Typed as | Steps by | Blank means |
|---|---|---|---|
| `bid`, `ask` | The instrument's notation (`99-16+`, `4.125`) through `parseQuote`; a typed decimal snaps to the printable grid | One quote step, ten with Shift; from the market's same side when the side is empty | No level on that side |
| `skew`, `width` | A plain decimal number of quote steps, including fractional steps; a width is zero or more | One step, ten with Shift; from zero when empty | Null |
| `bidSize`, `askSize` | A whole number from zero to `Number.MAX_SAFE_INTEGER` | One, ten with Shift; from zero when empty, never below zero | Null |

Numbers are plain decimals: `1e3` and `0x10` are refused. A crossed edit is refused in the editor before it is sent, read through the instrument's quote direction: a bid at or above the desk's ask, or an ask at or below its bid, normally — the reverse where the direction inverts.

### Limits

The generated editors call [`checkLimits`](limits.md) for non-null bids, asks, and sizes. A bid is passed as `{ bid }`, an ask as `{ ask }`, and a size as `{ quantity }`, with the row's market bid/ask and convention as context. Skew, width, and blank values bypass limits. The crossed-quote check runs before limits.

The first `block` refuses the value with its message. Otherwise, the first `confirm` refuses it with a question, `{message} Press Enter again to send it, or Escape to discard it.`, shown on the editor and in words above the grid, on a `role="status"` line carrying `data-quote-question`. The panel shows that line where a question can stand: with `limits` on the generated columns, with a `columns` function, and beside Pull all.

Only a fresh Enter on the same value, in the same opening of the editor, answers the question, provided no block or crossed quote now prevents it. Tab and the repeats of a held Enter ask again rather than send. One question stands at a time, as the line shows one: asking about another value, in any cell, replaces it, and a blank, crossed, or blocked value, or one inside the limits, withdraws it. Changing the text withdraws the question too, by typing or by a step with Up or Down, and so does every way out of the editor: Escape, a click away, Tab on to another cell, or the row leaving the view. A value typed again later is asked about again, and an answered value asks again the next time it is committed.

### Actions

Each `QuoteAction<T>` defines a row button:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Permission id in `allowedActions`. |
| `label` | `string` | Required | Button text. |
| `run` | `(row: T) => void \| Promise<unknown>` | Required | Handle the action for the rendered row. |
| `destructive` | `boolean` | `false` | Use destructive button styling; adds no confirmation. |

Buttons follow your `actions` order and appear only when `allowedActions` includes their ids. A click rechecks permission against the rendered row, and a press counts once: a double-click's second click and a held Enter's repeats run nothing. While a returned promise is pending, every action button on that row is disabled. Fulfillment or rejection re-enables them; rejection shows no built-in error. The status changes only when the store changes.

The same actions are on the row menu, so the keyboard reaches them: right-click the row, or press Shift+F10 or the Menu key on the focused row. With `actions` passed, a right-click on a row opens this menu instead of the browser's own. The buttons themselves stay out of the Tab order, keeping the grid one tab stop. The menu names the row it opened on and acts on that row alone, whatever else is selected. While it stays open, its items follow the row as the server changes it. A run started from either the menu or a button holds both until its promise settles; the hold is the panel's, so it survives the row scrolling out of view and back. A row the server allows no action on, and every row when `actions` is an empty list, shows `No actions for this row right now.` in its menu. Items your own `renderContextMenu` returns follow the row's actions. Pass `actions` always or never: switching between a list and `undefined` adds or removes the menu, which remounts the grid's rows.

When the control under focus leaves, focus moves to the grid so its keys keep working: a row button the server's reply removes, its row leaving the view or scrolling out of it, or Pull all disabling while its promise is out.

Action buttons and the gaps between them preserve row selection and logical focus, including while a command is pending.

Pull all appears when `onPullAll` is given. The first press changes its label to `Pull all anyway?`; a click elsewhere inside the panel, Escape within it, or focus leaving the panel cancels the question. The second press — a fresh one, not a double-click's second click or a held Enter's repeat — rereads the store and passes every row whose `allowedActions` includes `pullAction`, regardless of the grid's filter or selection. The button is disabled when no row allows the action or its returned promise is pending. Fulfillment or rejection clears the pending state without an error message. `data-quote-pull-all` carries the eligible row count.

### Columns

`quotePanelColumns(options)` returns eleven columns in this order: `instrument`, `status`, `marketBid`, `marketAsk`, `bid`, `ask`, `skew`, `width`, `bidSize`, `askSize`, and `actions`. Spread them into your own list to add, drop, or reorder. Supplying `columns` replaces the generated list, including its editors, formatting, permission checks, and row actions; panel props do not retrofit those features onto custom columns, except the row menu, which follows the panel's `actions`.

Pass `columns` as a function to keep the panel's question line. The panel calls it with `QuotePanelQuestion`, `{ asked, onQuestion }`: its memory of the question standing and its line. Spread that into `quotePanelColumns` or `quoteEdit`, and the panel withdraws the question for your columns as it does for its own. Keep the function stable, as you would a list: a new function rebuilds every column.

| Helper | Returns | Inputs |
|---|---|---|
| `quotePanelColumns<T>(options)` | `ColumnDef<T>[]` | `QuoteColumnOptions<T>` for the generated columns. |
| `quoteEdit<T>(field, options)` | `CellEdit<T>` | A `QuoteField` and `QuoteColumnOptions<T>` for its parser, stepper, permission check, and validation. |
| `allowsQuoteAction(row, id)` | `boolean` | A `QuoteRow` and action id (`string`); false for an absent or empty list. |

For example, inside your component, with a stable `convention`, `limits`, `actions`, and `labels`, the ones you pass the panel, as in [Confirming and blocking edits](#confirming-and-blocking-edits):

```tsx
import { useCallback } from "react"
import { quotePanelColumns, type QuotePanelQuestion, type QuoteRow } from "@/components/quote-panel"

// Inside the component: every generated column but skew, with the panel's question line.
const columns = useCallback(
  (question: QuotePanelQuestion) =>
    quotePanelColumns<QuoteRow>({ convention, limits, actions, labels, ...question }).filter((column) => column.key !== "skew"),
  [convention, limits, actions, labels],
)
// Pass columns={columns} to QuotePanel, with the same actions, so the row's buttons and its menu agree.
```

`QuoteColumnOptions<T>` requires `convention` and accepts `labels`, `editAction`, and `limits` with the types and defaults in the props table. It also accepts `actions` and `font`, which only `quotePanelColumns` uses, `asked?: Set<string>` for the question standing, and `onQuestion?: (question: string | null) => void`, told each question a confirm limit asks, and `null` when a later check answers it, blocks or crosses the value, finds nothing to ask, a blank value included, or comes from leaving the editor. Text that does not parse never reaches a check. It is not told when an editor closes without a commit or its text changes. In the panel, focus leaving the control that asked withdraws its question too, unless the window lost focus. `QuoteField` is `"bid" | "ask" | "skew" | "width" | "bidSize" | "askSize"`.

Outside the panel, in a grid of your own, create a stable `asked` set and pass it, with your own `onQuestion`, to every helper whose questions share one line; a set holds one question, so give each line you show its own. Clear the set, and the question you show, when the asking editor's text changes or focus leaves it, as the panel does; otherwise a value stepped or typed away and back in the same opening passes on the old question. Without a set, every confirming validation asks again.

A wrapper around the generated `validate` must pass the grid's third argument through: a call without it never answers a question. A cell control that commits through `edit.commit(value)` is asked in the words of `askAgainControl`, and answers by committing the same value again. A control that commits on a held key passes `{ repeat: true }` with those commits, which never answer.

### Labels

`labels` merges partial overrides into `DEFAULT_QUOTE_PANEL_LABELS`:

| Label | Default | Where |
|---|---|---|
| `instrument` / `status` / `marketBid` / `marketAsk` / `bid` / `ask` / `skew` / `width` / `bidSize` / `askSize` / `actions` | `Instrument` / `Status` / `Mkt bid` / `Mkt ask` / `Bid` / `Ask` / `Skew` / `Width` / `Bid size` / `Ask size` / `Actions` | Column headers |
| `pullAll` / `pullAllAnyway` | `Pull all` / `Pull all anyway?` | The button, and what it says while it asks |
| `notAQuote` / `notANumber` / `notASize` / `notAWidth` | `Not a quote in this instrument's notation.` / `Not a number.` / `A size is a whole number, zero or more.` / `A width is zero or more.` | Editor problems |
| `bidCrosses` / `askCrosses` | `The bid would cross the ask.` / `The ask would cross the bid.` | Editor problems |
| `askAgain` | `{message} Press Enter again to send it, or Escape to discard it.` | A limit that asks; `{message}` is its sentence |
| `askAgainControl` | `{message} Do it again to send it.` | A limit that asks about a value a cell control committed |
| `noActions` | `No actions for this row right now.` | The row menu when the server allows no action on the row |

### What it does not do

It does not quote, hedge, decide a status, or send anything on its own. The rows are the server's, an edit is a request, and a button is one of the actions the server said it would take.

### Tokens

The install adds the grid's tokens, `up`, `down`, and `flat`, and the soft variants of those and of `stale` and `expiring`, if you do not have them.
