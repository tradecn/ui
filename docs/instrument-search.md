# InstrumentSearch

Composable instrument search with query recognition, debounced requests, and caller-owned results.

## Usage

```tsx
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { CommandEmpty, CommandGroup } from "@/components/ui/command"
import { InstrumentSearch, InstrumentSearchContent, InstrumentSearchInput, InstrumentSearchList, InstrumentSearchItem, InstrumentSearchHint, useInstrumentSearchState, matchedIdentifier, type InstrumentHit, type InstrumentSearchFn } from "@/components/ui/instrument-search"

const instruments: InstrumentHit[] = [
  { id: "zn", symbol: "ZN", name: "T-Note future" },
  { id: "zb", symbol: "ZB", name: "T-Bond future" },
]
const search: InstrumentSearchFn = async (query) => instruments.filter((hit) => hit.symbol.startsWith(query.trim().toUpperCase()))

export default function InstrumentSearchDemo() {
  const [selected, setSelected] = useState("None")
  return <div className="min-h-56 w-sm max-w-full space-y-2 text-xs lining-nums tabular-nums">
    <InstrumentSearch search={search} onSelect={(hit) => setSelected(hit.symbol)} labels={{ placeholder: "Search ZN or ZB" }}>
      <InstrumentSearchContent>
        <InstrumentSearchInput />
        <InstrumentSearchList><InstrumentOptions /></InstrumentSearchList>
      </InstrumentSearchContent>
      <InstrumentSearchHint />
    </InstrumentSearch>
    <p role="status">Selected: {selected}</p>
  </div>
}

export function InstrumentOptions() {
  const { hits, loading, labels, emptyMessage } = useInstrumentSearchState()
  if (loading) return <div className="px-2 py-1.5 text-muted-foreground">{labels.searching}</div>
  if (!hits.length) return <CommandEmpty>{emptyMessage}</CommandEmpty>
  return <CommandGroup heading={labels.results}>
    {hits.map((hit) => <InstrumentSearchItem key={hit.id} hit={hit}><InstrumentHitContent hit={hit} /></InstrumentSearchItem>)}
  </CommandGroup>
}

export function InstrumentHitContent({ hit }: { hit: InstrumentHit }) {
  const { hint } = useInstrumentSearchState()
  const identifier = matchedIdentifier(hit, hint)
  return <span className="flex min-w-0 flex-1 items-center gap-2">
    <span className="font-semibold">{hit.symbol}</span>
    {hit.name && <span className="min-w-0 truncate text-muted-foreground">{hit.name}</span>}
    {identifier && <span className="font-(family-name:--tradecn-font-mono) text-muted-foreground lining-nums tabular-nums">{identifier}</span>}
    {hit.kind && <Badge variant="outline" className="ml-auto h-4 px-1 text-xs">{hit.kind}</Badge>}
  </span>
}
```

Type `z`, use the arrow keys to choose a result, and press Enter. Selection clears the query; the readout retains the chosen symbol.

Save the complete example as `instrument-search.tsx` outside `components/ui` to reuse `InstrumentOptions` and `InstrumentHitContent`. The installation includes the `command` and `badge` primitives used by this recipe.

## Composition

Use the following composition to build an `InstrumentSearch`:

```text
InstrumentSearch
├── InstrumentSearchContent
│   ├── InstrumentSearchInput
│   └── InstrumentSearchList
│       ├── Loading or empty content
│       └── CommandGroup
│           └── InstrumentSearchItem
└── InstrumentSearchHint
```

The root shares one search and selection implementation. Put application controls around Content, move or omit Hint, and write your own result collection with `useInstrumentSearchState`. Keep one Input and List inside each Content.

## Recognition and cancellation

Use the same parts with a controlled query and an abortable service request. Save `InstrumentOptions` from Usage in `./instrument-search.tsx` first.

This example adds a 300 ms request delay after the debounce. Its local lookup matches recognized identifiers or numeric coupon and maturity fields. It treats two-digit years as 2000–2099; the recognizer preserves the written year. An optional day or ticker must match when supplied.

<!-- demo: instrument-search-hints -->

## Custom layout

Move the input and hint beside a reordered result list. The clear action shares query state and returns focus to the input; selection retains the query.

<!-- demo: instrument-search-layout -->

## Palette adapter

Install [`command-palette`](command-palette.md) separately to use `toSymbolAdapter(search)` with its `symbols` prop. Create the adapter once, at module scope or with `useMemo`: the palette keys its request and results on the adapter's identity, so an inline call aborts the request and hides results on every parent render. The adapter forwards the recognized query and abort signal; the palette owns debounce, selection and recents.

This standalone example searches the same two symbols in an inline go-bar and declares no hotkey. Instrument IDs and identifiers are not part of the adapter's results.

<!-- demo: instrument-search-palette -->

## API Reference

### Props

`InstrumentSearch` accepts native div props and refs, with required children. Its `onSelect` is the instrument callback, not the native text-selection event.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `search` | `InstrumentSearchFn` | Required | Your asynchronous instrument lookup. |
| `onSelect` | `(hit, hint) => void` | Required | Receives the current offered hit and query hint. |
| `children` | `ReactNode` | Required | Search parts and application content. |
| `query` | `string` | Internal `""` | Controlled query. |
| `onQueryChange` | `(query: string) => void` | Unset | Edits and clear requests, including uncontrolled mode. |
| `minLength` | `number` | `1` | Minimum trimmed query length; blank input never searches. |
| `debounceMs` | `number` | `150` | Delay before a request, in milliseconds. |
| `clearOnSelect` | `boolean` | `true` | Requests an empty query after selection. |
| `labels` | `Partial<InstrumentSearchLabels>` | See Labels | Field, recipe and recognition text. |
| `className` | `string` | Unset | Additional classes to apply to the root. |

The full selection signature is `(hit: InstrumentHit, hint: QueryHint) => void`. The callback runs before a clear request. In controlled mode, the parent must update `query`; omitting `onQueryChange` leaves displayed input under the parent's control.

### InstrumentSearchContent

Wraps your installed `Command`, with required children and `shouldFilter={false}`. Server results are not filtered again. Native props, refs, classes and command options such as `loop` remain available; `filter` and `shouldFilter` belong to the search integration.

`label` defaults to `"Instrument search"` and supplies the input's accessible name through cmdk's hidden label. Set it to a meaningful localized name. A placeholder is separate from that name.

### InstrumentSearchInput

Wraps `CommandInput` and binds `value` and edits to the root query. Pass `autoFocus`, `disabled`, `placeholder`, refs, classes and supported input events here. The default placeholder comes from `labels.placeholder`; root `onQueryChange` receives edits.

cmdk owns the input ID, text type, combobox role, autocomplete settings, selection ARIA and naming association. These overridden props are excluded from the public type. Use Content's `label` to name the field and the input ref to focus it. `aria-describedby` is merged with mounted Hint IDs, with duplicates removed.

### InstrumentSearchList

Wraps `CommandList`, with required children. It remains mounted when the query is inactive, but renders its children only once the nonblank query meets `minLength`. This retains the inline combobox's list target without showing stale results.

`label` defaults to `"Suggestions"` and names the listbox. Pass refs, classes and native events; cmdk owns its ID, role, tab index, active descendant and `aria-label`.

### InstrumentSearchItem

Takes a required `hit: InstrumentHit` and required `children: ReactNode`. It binds the command item's value and selection to `hit.id`; use a unique ID for each offered hit. Selection resolves the ID against the latest committed results and sends that current record to `onSelect`. A stale or missing ID does nothing.

Pass `disabled`, refs, classes and supported native events. cmdk owns the item's ID, option role, selected/disabled ARIA, click and pointer-move handlers; these overrides are excluded from the public type. Keep row content noninteractive and place separate application actions outside Content.

### InstrumentSearchHint

A paragraph showing the recognized query kind, with parsed coupon and maturity when present. It accepts native paragraph props, refs and classes; children replace its default text. It renders nothing for a blank query.

Each mounted nonblank Hint supplies its unique ID, or your `id`, to the root's inputs. Association survives reordering and portals and is removed when the Hint is omitted. CSS-hidden referenced descriptions retain native ARIA behavior; omit the part when you want no description. Keep custom IDs unique.

### useInstrumentSearchState

Reads the nearest root without starting another request. Use it for your own statuses, result order or controls.

| Field | Type | Purpose |
|---|---|---|
| `query` | `string` | Current input. |
| `setQuery` | `(query: string) => void` | Apply or request a query change. |
| `hint` | `QueryHint` | Recognition of the current query. |
| `hits` | `readonly InstrumentHit[]` | Results for this query and search function. |
| `active` | `boolean` | Nonblank query meets `minLength`. |
| `loading` | `boolean` | Active search without a matching stored result. |
| `labels` | `InstrumentSearchLabels` | Merged default and caller labels. |
| `emptyMessage` | `string` | Empty label with the trimmed query substituted. |
| `select` | `(hit: InstrumentHit) => void` | Select the current offered record with this ID. |

`setQuery` and `select` retain their identity and use committed callbacks and settings. Custom controls own their disabled state and focus destination.

### It knows no instruments

`InstrumentSearchFn` takes `(query: string, hint: QueryHint, signal: AbortSignal)` and returns `Promise<readonly InstrumentHit[]>`. The query reaches your function as typed from the root, including its spaces and case; through the palette it arrives trimmed. The hint contains the recognized form.

The field waits for the debounce before searching. A query change cancels the pending timer and aborts the previous request; unmounting does the same. Responses from an aborted request are ignored even if your search does not honor the signal. Stored hits appear only when their query string equals the current input, so rows from a different query cannot be selected. A stored result for the exact same query and search function can remain visible while a new request runs. Replacing the search function removes the previous provider's hits immediately.

Keep `search` stable: define it at module scope or memoize it with `useCallback`. An inline function changes identity on each parent render and restarts the search. Standalone `useInstrumentSearch` cannot settle visible results when each render supplies a new function.

The searching label appears during the debounce and request when there is no stored result for that query. A rejected promise or synchronous throw becomes an empty result; the Usage recipe shows the empty label. There is no separate error display.

### InstrumentHit

| Field | Type | Required | Use |
|---|---|---|---|
| `id` | `string` | Yes | Unique row key and command-item value. |
| `symbol` | `string` | Yes | Ticker or short form shown at the start of the row. |
| `name` | `string` | No | Long name shown after the symbol. |
| `kind` | `string` | No | Asset class or instrument type shown as a badge. |
| `exchange` | `string` | No | Passed through the symbol adapter; not shown by the Usage recipe. |
| `cusip` | `string` | No | Shown when the query hint is `cusip`. |
| `isin` | `string` | No | Shown when the query hint is `isin`. |

The Usage recipe omits empty optional strings. Replace the children of `InstrumentSearchItem` to change the row while retaining current-hit selection.

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

Results appear once the trimmed query reaches `minLength`. The inline command keeps an empty listbox mounted before then, so the input always has a valid list target. Up and Down move through the rendered results; Enter selects one and calls `onSelect(hit, hint)`. The field clears after selection unless `clearOnSelect={false}`. In controlled mode, `onQueryChange("")` asks the parent to clear it; the parent must update `query` for the displayed value to change.

The list uses your `command` with filtering off. The Usage recipe retains server order; your composition can reorder or group hits. Place application buttons outside `InstrumentSearchContent` to keep command keyboard handling separate from their activation.

The recognition hint can appear before `minLength` is reached. Omit `InstrumentSearchHint` to remove its presentation and input association without changing recognition or the hint sent to callbacks.

### The same search everywhere

`toSymbolAdapter(search, options?)` supplies [`command-palette`](command-palette.md)'s `symbols` prop. It recognizes each query and forwards the palette's abort signal to your search. Each hit becomes `{ symbol, name, exchange, kind }`; `id`, `cusip`, and `isin` are dropped. Optional `minLength` and `debounceMs` pass through to the palette, which defaults to a minimum query length of `1` character and a debounce of `150` milliseconds. The adapter itself does not debounce or enforce a minimum length.

[`watchlist`](watchlist.md)'s `onAdd` and `validate` receive a symbol string. Run the asynchronous search in `onAdd` with `recognizeQuery(symbol)` and your own abort signal. Watchlist does not await `onAdd`; handle search failures in your callback. `validate` must return a synchronous boolean, so use it for immediate checks or cached results.

The standalone search and identifier helpers remain available from `@/components/ui/instrument-search`:

| Helper | Result | Behavior |
|---|---|---|
| `useInstrumentSearch(search, query, options?)` | `{ hint, hits, loading }` | The component's search hook. `search` may be `undefined`; options are `minLength` (default `1`) and `debounceMs` (default `150` milliseconds). An inactive search returns empty hits and `loading: false`, while still recognizing the query. `loading` is also false when stored results match the query and search function, even during a new request. |
| `matchedIdentifier(hit, hint)` | `string \| null` | Returns a nonempty `hit.cusip` for a `cusip` hint, or `hit.isin` for an `isin` hint; otherwise `null`. It does not compare that value with the query's identifier. |

### Labels

Pass a partial `labels` object to override `DEFAULT_INSTRUMENT_SEARCH_LABELS`:

| Label | Default | Shown as |
|---|---|---|
| `placeholder` | `Ticker, CUSIP, ISIN, or coupon and maturity` | Input placeholder. |
| `searching` | `Searching…` | Pending text in the Usage recipe. |
| `empty` | `Nothing matches {query}.` | Empty or failed search in the recipe; `{query}` is the trimmed input. |
| `results` | `Instruments` | Results group heading in the recipe. |
| `recognized` | `Read as {kind}` | Recognition hint; `{kind}` comes from `QUERY_KIND_LABELS`. |

`QUERY_KIND_LABELS` in `instrument-query` supplies `CUSIP`, `ISIN`, `Coupon and maturity`, `Ticker`, `Text`, and an empty string for `empty`. These words are separate from the `labels` overrides. Coupon-and-maturity hints append the parsed ticker (when present), coupon, and maturity after the recognized label.

### What it does not do

The component does not resolve identifiers, maintain an instrument catalog, or decide what qualifies as a hit. Recents and hotkeys belong to the palette; a surrounding dialog is yours.
