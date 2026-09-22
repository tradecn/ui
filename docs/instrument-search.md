# InstrumentSearch

A search field that recognizes CUSIPs, ISINs, tickers, and coupon-and-maturity phrases, sends your search function the query and a recognition hint, and displays the results in your own `command`.

## Usage

```tsx
import { InstrumentSearch, toSymbolAdapter, type InstrumentHit, type InstrumentSearchFn } from "@/components/ui/instrument-search"
import { recognizeQuery } from "@/lib/instrument-query"
```

```tsx
const search: InstrumentSearchFn = (query, hint, signal) => api.instruments({ query, ...hint }, { signal })

<InstrumentSearch search={search} onSelect={(hit) => openTicket(hit.id)} autoFocus />

// The same function behind the palette's symbol rows and the watchlist's add field.
<CommandPalette actions={actions} symbols={toSymbolAdapter(search)} onSymbolSelect={(s) => load(s.symbol)} />
<Watchlist store={store} onAdd={async (symbol) => { const [hit] = await search(symbol, recognizeQuery(symbol), new AbortController().signal); if (hit) api.watch(hit.id) }} />
```

## API Reference

### Props

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `search` | `InstrumentSearchFn` | Required | Your asynchronous instrument lookup. |
| `onSelect` | `(hit: InstrumentHit, hint: QueryHint) => void` | Required | Receives the selected hit and the current query's hint. |
| `query` | `string` | Internal state, initially `""` | Controls the field when supplied; update it through `onQueryChange`. |
| `onQueryChange` | `(query: string) => void` | Unset | Receives edits and the empty string when a selection clears the field. Also works in uncontrolled mode. |
| `minLength` | `number` | `1` | Minimum trimmed query length for searching and showing the list. Blank input never searches. |
| `debounceMs` | `number` | `150` | Delay before starting a search, in milliseconds. |
| `clearOnSelect` | `boolean` | `true` | Clears the query after calling `onSelect`. |
| `showHint` | `boolean` | `true` | Shows the recognized kind below nonblank input and connects it with `aria-describedby`. |
| `autoFocus` | `boolean` | Unset | Passed to your `CommandInput`. |
| `labels` | `Partial<InstrumentSearchLabels>` | `DEFAULT_INSTRUMENT_SEARCH_LABELS` | Overrides the strings below. |
| `renderHit` | `(hit: InstrumentHit, hint: QueryHint) => React.ReactNode` | Built-in row | Replaces a result row's contents. |
| `className` | `string` | Unset | Styles the outer container. |

### It knows no instruments

`InstrumentSearchFn` takes `(query: string, hint: QueryHint, signal: AbortSignal)` and returns `Promise<readonly InstrumentHit[]>`. The query reaches your function as typed, including its spaces and case; the hint contains the recognized form.

The field waits for the debounce before searching. A query change cancels the pending timer and aborts the previous request; unmounting does the same. Responses from an aborted request are ignored even if your search does not honor the signal. Stored hits appear only when their query string equals the current input, so rows from a different query cannot be selected. A stored result for the exact same query can remain visible while a new request runs.

The searching label appears during the debounce and request when there is no stored result for that query. A rejected promise becomes an empty result and shows the empty label; there is no separate error display.

### InstrumentHit

| Field | Type | Required | Use |
|---|---|---|---|
| `id` | `string` | Yes | Unique row key and command-item value. |
| `symbol` | `string` | Yes | Ticker or short form shown at the start of the row. |
| `name` | `string` | No | Long name shown after the symbol. |
| `kind` | `string` | No | Asset class or instrument type shown as a badge. |
| `exchange` | `string` | No | Passed through the symbol adapter; not shown by the default row. |
| `cusip` | `string` | No | Shown when the query hint is `cusip`. |
| `isin` | `string` | No | Shown when the query hint is `isin`. |

Empty optional strings are omitted from the default row. `renderHit` replaces these contents while keeping the command item's selection behavior.

### What was typed

`recognizeQuery(text)` comes from `@/lib/instrument-query`, installed alongside the component. It trims the input, collapses whitespace, and returns the first matching kind in this order:

| Kind | Recognition | Hint fields beyond `kind` and `normalized` |
|---|---|---|
| `empty` | Blank or whitespace-only input. | None; `normalized` is `""`. |
| `cusip` | Nine characters with a valid modulus-10 check digit. | `cusip`, uppercase. |
| `isin` | Twelve characters with the expected identifier syntax and a valid Luhn check digit. | `isin`, uppercase. |
| `coupon-maturity` | A coupon followed by a maturity, optionally prefixed: `4 1/8 05/34`, `4.125 5/15/2034`, or `T 4 1/8 05/15/34`. | Numeric `coupon`, `maturity`, `maturityParts`, and uppercase `ticker` when a prefix is present. |
| `ticker` | A letter followed by up to 11 letters or digits, optionally a dot or dash and 1–4 more letters or digits: `ZN`, `ESZ6`, `BRK.B`. | `ticker`, uppercase. |
| `text` | Anything else. | None. |

`normalized` is uppercase for identifiers and tickers. Coupon-and-maturity and text queries retain their case after whitespace cleanup. A failed check digit falls through to the remaining recognizers: `037833101` becomes `text`, while `A37833101` becomes `ticker`. Recognition checks the identifier's format and digit; your server decides what it names.

`QueryHint` always has `kind: QueryKind` and `normalized: string`. Its optional identifier and ticker fields are strings. `coupon` is a number in percentage points (`4 1/8` becomes `4.125`); `maturity` retains the date's written form. `maturityParts` is `{ month: number; day?: number; year: number }`; the year is not expanded to a century (`34`, not `2034`).

These pure helpers are also exported from `instrument-query` for other fields or paste handlers. Each takes a string:

| Helper | Result | Accepted input and limits |
|---|---|---|
| `isCusip(text)` | `boolean` | Trims and uppercases; accepts eight letters, digits, `*`, `@`, or `#`, followed by the correct numeric check digit. |
| `isIsin(text)` | `boolean` | Trims and uppercases; accepts two letters, nine letters or digits, and a numeric check digit that passes Luhn. |
| `parseCoupon(text)` | `number \| null` | Whole numbers or decimals with 1–2 whole digits, up to three decimal places, and an optional `%` suffix. Fractions are `1/8`, `1/4`, `3/8`, `1/2`, `5/8`, `3/4`, or `7/8`, alone or after 1–2 whole digits; fractions cannot carry `%`. |
| `parseMaturity(text)` | `{ month: number; day?: number; year: number; text: string } \| null` | Slash forms `M/YY`, `M/YYYY`, `M/D/YY`, `M/D/YYYY` (one or two month/day digits), or `YYYY-MM-DD`. Returns the trimmed text unchanged. |
| `parseCouponMaturity(text)` | `{ coupon: number; maturity: string; maturityParts: { month: number; day?: number; year: number }; prefix?: string } \| null` | Takes the final word as maturity, then tries the preceding two words as a coupon before trying one. Any words left become `prefix`, preserving case; `recognizeQuery` exposes that prefix as uppercase `ticker`. |

Maturity parsing is not calendar validation. Slash dates require months 1–12 and days 1–31 but can still name impossible dates; ISO-shaped input receives no month or day range check.

### Keyboard first

Once the trimmed query reaches `minLength`, the list opens under the field. Up and Down move through results; Enter selects one and calls `onSelect(hit, hint)`. The field clears after selection unless `clearOnSelect={false}`. In controlled mode, `onQueryChange("")` asks the parent to clear it; the parent must update `query` for the displayed value to change.

The list uses your `command` with filtering off. Results stay in server order. The recognition hint can appear before `minLength` is reached; `showHint={false}` hides it without changing recognition or the hint sent to your callbacks.

### The same search everywhere

`toSymbolAdapter(search, options?)` supplies [`command-palette`](command-palette.md)'s `symbols` prop. It recognizes each query and forwards the palette's abort signal to your search. Each hit becomes `{ symbol, name, exchange, kind }`; `id`, `cusip`, and `isin` are dropped. Optional `minLength` and `debounceMs` pass through to the palette, which defaults to a minimum query length of `1` character and a debounce of `150` milliseconds. The adapter itself does not debounce or enforce a minimum length.

[`watchlist`](watchlist.md)'s `onAdd` and `validate` receive a symbol string. Run the asynchronous search in `onAdd` with `recognizeQuery(symbol)` and your own abort signal, as in Usage. Watchlist does not await `onAdd`; handle search failures in your callback. `validate` must return a synchronous boolean, so use it for immediate checks or cached results.

Two more helpers are exported from `@/components/ui/instrument-search`:

| Helper | Result | Behavior |
|---|---|---|
| `useInstrumentSearch(search, query, options?)` | `{ hint, hits, loading }` | The component's search hook. `search` may be `undefined`; options are `minLength` (default `1`) and `debounceMs` (default `150` milliseconds). An inactive search returns empty hits and `loading: false`, while still recognizing the query. `loading` is also false when stored results match the query, even during a new request. |
| `matchedIdentifier(hit, hint)` | `string \| null` | Returns a nonempty `hit.cusip` for a `cusip` hint, or `hit.isin` for an `isin` hint; otherwise `null`. It does not compare that value with the query's identifier. |

### Labels

Pass a partial `labels` object to override `DEFAULT_INSTRUMENT_SEARCH_LABELS`:

| Label | Default | Shown as |
|---|---|---|
| `placeholder` | `Ticker, CUSIP, ISIN, or coupon and maturity` | Input placeholder. |
| `searching` | `Searching…` | Pending search status. |
| `empty` | `Nothing matches {query}.` | Empty or rejected search; `{query}` is the trimmed input. |
| `results` | `Instruments` | Results group heading. |
| `recognized` | `Read as {kind}` | Recognition hint; `{kind}` comes from `QUERY_KIND_LABELS`. |

`QUERY_KIND_LABELS` in `instrument-query` supplies `CUSIP`, `ISIN`, `Coupon and maturity`, `Ticker`, `Text`, and an empty string for `empty`. These words are separate from the `labels` overrides. Coupon-and-maturity hints append the parsed ticker (when present), coupon, and maturity after the recognized label.

### What it does not do

The component does not resolve identifiers, maintain an instrument catalog, or decide what qualifies as a hit. Recents and hotkeys belong to the palette; a surrounding dialog is yours.
