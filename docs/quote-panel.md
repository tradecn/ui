# QuotePanel

Edit a market maker's bid, ask, skew, width, and sizes beside the market's two-way. Each instrument has one row, with the server's status and allowed actions.

## Usage

```tsx
import { QuotePanel, type QuoteAction, type QuoteRow } from "@/components/quote-panel"
import type { InstrumentConvention } from "@/lib/format"
import type { Limits } from "@/lib/limits"
import { createRowStore } from "@/lib/row-store"
```

```tsx
const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const quotes = createRowStore<QuoteRow>({ getRowId: (q) => q.id })
const ACTIONS: QuoteAction[] = [
  { id: "pause", label: "Pause", run: (row) => api.pause(row.id) },
  { id: "resume", label: "Resume", run: (row) => api.resume(row.id) },
  { id: "pull", label: "Pull", destructive: true, run: (row) => api.pull(row.id) },
]
const LIMITS: Limits = { maxDistance: { ticks: 4, level: "confirm" }, maxQuantity: { confirm: 50_000_000, block: 100_000_000 } }

<QuotePanel
  store={quotes}
  convention={T32}
  actions={ACTIONS}
  limits={LIMITS}
  onEdit={(change) => api.setQuote(change.rowId, change.key, change.value)}
  onPullAll={(rows) => api.pull(rows.map((r) => r.id))}
/>
```

## API Reference

`QuotePanel` uses [`data-grid`](data-grid.md) in its `parameters` preset with generated quote columns and an optional Pull all button. Shared files are byte-identical to the ones `data-grid` and `parameter-grid` install.

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
| `columns` | `ColumnDef<T>[]` | `quotePanelColumns(options)` | Replace the generated column list. |
| `label` | `string` | `"Quotes"` | Accessible name for the grid. |
| `labels` | `Partial<QuotePanelLabels>` | `DEFAULT_QUOTE_PANEL_LABELS` | Override the words listed below. |
| `className` | `string` | None | Classes on the outer wrapper. |

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

A valid change calls `onEdit` with `{ rowId, key, value, previous, row }`. The generated keys are `bid`, `ask`, `skew`, `width`, `bidSize`, and `askSize`; `previous` and `row` come from the current store. Committing the same value sends nothing. The panel never writes the store.

The cell shows the committed value as pending until the store matches it (`Object.is`) or your promise resolves. Resolution displays the current store value, which may still be the old value. Returning nothing leaves the cell pending until the store matches or the editor reopens. Reopening starts from the committed text and replaces the pending state; Escape then discards the draft. Promise completion affects only a matching value that is still pending. A thrown error or rejection of a still-pending promise displays the current store value and the error message; reopening clears the error.

| Field | Typed as | Steps by | Blank means |
|---|---|---|---|
| `bid`, `ask` | The instrument's notation (`99-16+`, `4.125`) through `parseQuote` | One quote step, ten with Shift; from the market's same side when the side is empty | No level on that side |
| `skew`, `width` | A number of quote steps, including fractional steps | One step, ten with Shift; from zero when empty | Null |
| `bidSize`, `askSize` | A whole number, zero or more | One, ten with Shift; from zero when empty, never below zero | Null |

A bid at or above the desk's ask, or an ask at or below its bid, is refused in the editor before it is sent.

### Limits

The generated editors call [`checkLimits`](limits.md) for non-null bids, asks, and sizes. A bid is passed as `{ bid }`, an ask as `{ ask }`, and a size as `{ quantity }`, with the row's market bid/ask and convention as context. Skew, width, and blank values bypass limits. The crossed-quote check runs before limits.

The first `block` refuses the value with its message. Otherwise, the first `confirm` asks with `{message} Enter again sends it.` The next validation that still produces a confirm for that row id, field, and numeric value consumes the remembered question and passes, provided no block or crossed quote now prevents it. Enter, Tab, or leaving the editor can trigger that validation; confirmation is not restricted to a second Enter. A later attempt at the consumed value asks again if it still needs confirmation.

Unanswered questions remain in the panel's private set until consumed or the panel unmounts. Escape, trying another value, removing a row, changing the market or limits, and validations with no current confirm do not clear them. Returning to a previously asked value can therefore pass without another question. For custom columns, supply your own stable `asked` set as described below.

### Actions

Each `QuoteAction<T>` defines a row button:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Permission id in `allowedActions`. |
| `label` | `string` | Required | Button text. |
| `run` | `(row: T) => void \| Promise<unknown>` | Required | Handle the action for the rendered row. |
| `destructive` | `boolean` | `false` | Use destructive button styling; adds no confirmation. |

Buttons follow your `actions` order and appear only when `allowedActions` includes their ids. A click rechecks permission against the rendered row. While a returned promise is pending, every action button on that row is disabled. Fulfillment or rejection re-enables them; rejection shows no built-in error. The status changes only when the store changes.

Pull all appears when `onPullAll` is given. The first press changes its label to `Pull all anyway?`; a click elsewhere inside the panel or Escape within it cancels the question. The second press rereads the store and passes every row whose `allowedActions` includes `pullAction`, regardless of the grid's filter or selection. The button is disabled when no row allows the action or its returned promise is pending. Fulfillment or rejection clears the pending state without an error message. `data-quote-pull-all` carries the eligible row count.

### Columns

`quotePanelColumns(options)` returns eleven columns in this order: `instrument`, `status`, `marketBid`, `marketAsk`, `bid`, `ask`, `skew`, `width`, `bidSize`, `askSize`, and `actions`. Spread them into your own list to add, drop, or reorder. Supplying `columns` replaces the generated list, including its editors, formatting, permission checks, and row actions; panel props do not retrofit those features onto custom columns.

| Helper | Returns | Inputs |
|---|---|---|
| `quotePanelColumns<T>(options)` | `ColumnDef<T>[]` | `QuoteColumnOptions<T>` for the generated columns. |
| `quoteEdit<T>(field, options)` | `CellEdit<T>` | A `QuoteField` and `QuoteColumnOptions<T>` for its parser, stepper, permission check, and validation. |
| `allowsQuoteAction(row, id)` | `boolean` | A `QuoteRow` and action id (`string`); false for an absent or empty list. |

`QuoteColumnOptions<T>` requires `convention` and accepts `labels`, `editAction`, and `limits` with the types and defaults in the props table. It also accepts `actions` and `font`, which only `quotePanelColumns` uses, and `asked?: Set<string>` for confirmation memory. `QuoteField` is `"bid" | "ask" | "skew" | "width" | "bidSize" | "askSize"`.

The panel does not expose its private `asked` set or accept it as a prop. When calling either helper yourself with confirm limits, create a stable set and pass it to every helper that should share confirmation memory. Without it, every confirming validation asks again. Keep the set across renders; clear or replace it when your application needs to discard unanswered questions.

For example, inside your component, using `T32` and `LIMITS` from Usage:

```tsx
import { useMemo, useState } from "react"
import { quotePanelColumns, type QuoteRow } from "@/components/quote-panel"

// Inside the component:
const [asked] = useState(() => new Set<string>())
const columns = useMemo(
  () => quotePanelColumns<QuoteRow>({ convention: T32, limits: LIMITS, asked }),
  [asked],
)
// Pass columns={columns} to QuotePanel.
```

### Labels

`labels` merges partial overrides into `DEFAULT_QUOTE_PANEL_LABELS`:

| Label | Default | Where |
|---|---|---|
| `instrument` / `status` / `marketBid` / `marketAsk` / `bid` / `ask` / `skew` / `width` / `bidSize` / `askSize` / `actions` | `Instrument` / `Status` / `Mkt bid` / `Mkt ask` / `Bid` / `Ask` / `Skew` / `Width` / `Bid size` / `Ask size` / `Actions` | Column headers |
| `pullAll` / `pullAllAnyway` | `Pull all` / `Pull all anyway?` | The button, and what it says while it asks |
| `notAQuote` / `notANumber` / `notASize` | `Not a quote in this instrument's notation.` / `Not a number.` / `A size is a whole number, zero or more.` | Editor problems |
| `bidCrosses` / `askCrosses` | `The bid would cross the ask.` / `The ask would cross the bid.` | Editor problems |
| `askAgain` | `{message} Enter again sends it.` | A limit that asks; `{message}` is its sentence |

### What it does not do

It does not quote, hedge, decide a status, or send anything on its own. The rows are the server's, an edit is a request, and a button is one of the actions the server said it would take.

### Tokens

The install adds the grid's tokens, `up`, `down`, `flat`, `stale`, and `expiring` with their soft variants, if you do not have them.
