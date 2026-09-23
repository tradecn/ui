# QuotePanel

A market maker's two-way panel: one row per instrument with the market's bid and ask, the desk's bid and ask, skew, width, a size per side, the server's status word, and the actions the server allows, every level typed in place and checked against the limits.

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

`QuotePanel` is [`data-grid`](data-grid.md) in its `parameters` preset with the quote columns and a Pull all button over it. Every level, size, skew, and width is edited through the grid's editing contract, so an edit is a command the server answers and never a local truth; shared files are byte-identical to the ones `data-grid` and `parameter-grid` install.

### Props

`QuotePanelProps<T>` requires `T extends QuoteRow`. It inherits [`DataGridProps<T>`](data-grid.md) except `preset`, `columns`, `label`, and `onEdit`; the latter three have the definitions below.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `store` | `RowStore<T>` | Required | Quotes keyed by their `id`. |
| `convention` | `InstrumentConvention \| (row: T) => InstrumentConvention` | Required | How the levels print, parse, and step: one for every row, or one per row. |
| `onEdit` | `(change: EditChange<T>) => void \| Promise<unknown>` | Required | Send a typed level, size, skew, or width to the server. |
| `actions` | `readonly QuoteAction<T>[]` | None | The row's buttons, shown where `allowedActions` names them. |
| `onPullAll` | `(rows: T[]) => void \| Promise<unknown>` | None | Show Pull all; receive every row the server allows the pull action on. |
| `pullAction` | `string` | `"pull"` | The id Pull all looks for in `allowedActions`. |
| `editAction` | `string` | `"edit"` | The id that lets a row's values be typed. |
| `limits` | `Limits \| (row: T) => Limits \| undefined` | None | The fat-finger lines every edit is checked against. |
| `font` | `"numeric" \| "mono"` | From the convention | The family the price columns set in; the mono stack for a fraction convention. |
| `columns` | `ColumnDef<T>[]` | `quotePanelColumns(options)` | Replace the generated column list. |
| `label` | `string` | `"Quotes"` | Accessible name for the grid. |
| `labels` | `Partial<QuotePanelLabels>` | `DEFAULT_QUOTE_PANEL_LABELS` | Override the words listed below. |
| `className` | `string` | None | Classes on the outer wrapper. |

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
| `updatedAt` | `number \| null` | No | When the server last changed the row. |

A quote step is the tick for a price basis and `quoteStep` for a yield, discount, or spread basis, as `format` defines it.

### Every edit is a command

Enter, F2, a double click, or typing opens a cell the row's `allowedActions` lets you edit; Enter commits; Escape reverts; Tab and Shift+Tab commit and move along the row; Up and Down step. A commit calls `onEdit` with `{ rowId, key, value, previous, row }`, where `key` is `bid`, `ask`, `skew`, `width`, `bidSize`, or `askSize`. The cell shows what was typed as pending until the row comes back with that value or your promise resolves; a rejection keeps the previous value and prints the server's message in the cell. The panel never writes the store.

| Field | Typed as | Steps by | Blank means |
|---|---|---|---|
| `bid`, `ask` | The instrument's notation (`99-16+`, `4.125`) through `parseQuote` | One quote step, ten with Shift; from the market's same side when the side is empty | No level on that side |
| `skew`, `width` | A number of quote steps | One step, ten with Shift | Null |
| `bidSize`, `askSize` | A whole number, zero or more | One, ten with Shift | Null |

A bid at or above the desk's ask, or an ask at or below its bid, is refused in the editor before it is sent.

### Limits

`limits` is the table [`limits`](limits.md) defines, for every row or per row, and runs as a value is committed with the row's market as the reference and the row's convention for distances. A `block` refuses the value in the editor with the limit's sentence. A `confirm` refuses it once, with the question and `Enter again sends it.`, and the same value commits on the next Enter; a different value asks again. A bid is checked as a bid against the market's bid, an ask against the market's ask, and a size as a quantity. Skew and width are not checked against the table.

### Actions

Each `QuoteAction` is `{ id, label, run(row), destructive? }`. A row shows a button for every action its `allowedActions` names, in your order, checked again against the row as the click lands; a button is held while its run's promise is out. The status word never moves on a click. It moves when the server's next batch says so.

Pull all, shown when `onPullAll` is given, asks again: the first press turns it into `Pull all anyway?` and any other press in the panel, or Escape, withdraws the question; the second press hands `onPullAll` every row whose `allowedActions` names `pullAction`. The button is disabled while no row allows it, and while the promise is out. `data-quote-pull-all` carries the count.

### Columns

`quotePanelColumns(options)` returns the eleven columns keyed `instrument`, `status`, `marketBid`, `marketAsk`, `bid`, `ask`, `skew`, `width`, `bidSize`, `askSize`, and `actions`; spread them into your own list to add, drop, or reorder. `quoteEdit(field, options)` builds one field's `CellEdit<T>` for a column of your own, and `allowsQuoteAction(row, id)` is the membership check. The options are `convention`, `labels`, `actions`, `editAction`, `limits`, `font`, and `asked`, the set of confirms already answered, which the panel owns and a custom column shares by taking it from the panel's props.

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
