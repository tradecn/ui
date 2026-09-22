# InstrumentSearch

A typed field over your instrument search that recognizes what was typed, a CUSIP, an ISIN, a ticker, or a coupon and maturity, hands the server the query with that hint, and lists what came back on your own `command`.

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

### It knows no instruments

The field types, the server answers. `search(query, hint, signal)` is yours: the query as typed, what it looks like, and a signal that aborts when the query moves on. The field debounces (`debounceMs`, 150), aborts the request in flight when the query changes, and shows only answers to the query on screen, so a row left over from three letters ago is never the one Enter picks. A rejected search is no results, said as such. An `InstrumentHit` is `{ id, symbol, name?, kind?, exchange?, cusip?, isin? }`; the row shows the symbol, the name, the identifier the query matched on when it was one, and the kind as a badge, or whatever `renderHit` draws.

### What was typed

`recognizeQuery(text)` in `instrument-query`, installed alongside, reads the query before it goes out and returns a `QueryHint`: `cusip` when the nine characters carry their modulus-10 check digit, `isin` when the twelve carry their Luhn digit, `coupon-maturity` for a run's phrase (`4 1/8 05/34`, `4.125 5/15/2034`, `T 4 1/8 05/15/34` with the prefix as `ticker`), `ticker` for letters and digits with one dot or dash, else `text`. A nine-character string that fails its check digit is a ticker, not a CUSIP. The hint says so under the field (`Read as CUSIP`) and rides to the server, so a search that keys its index by identifier does not have to guess. `isCusip`, `isIsin`, `parseCoupon`, `parseMaturity`, and `parseCouponMaturity` are the parts, for a ticket's symbol field or a paste handler of your own. The identifier is checked, not resolved: what it names is the server's to say.

### Keyboard first

Type, the list opens under the field; Up and Down move, Enter picks, and `onSelect(hit, hint)` is called with the hit and what the query was read as. The field clears after a pick unless `clearOnSelect={false}`. `query` and `onQueryChange` make the field controlled. The list is your `command`, with its filtering off: the server already answered the query, and every answer stays in the order it came.

### The same search everywhere

`toSymbolAdapter(search)` is the adapter [`command-palette`](command-palette.md)'s `symbols` takes, over the same function, so a symbol typed into the palette is recognized the same way and hits the same index. [`watchlist`](watchlist.md)'s `onAdd` and `validate` take a symbol string; call `search` with `recognizeQuery(symbol)` inside them and one function serves all three fields without a prop changing.

### Labels

Every word is in `labels`, a partial of `DEFAULT_INSTRUMENT_SEARCH_LABELS`: the placeholder, the searching line, the empty line with the query in it, the list's heading, and the `Read as {kind}` line. `QUERY_KIND_LABELS` in `instrument-query` are the kinds' words.

### What it does not do

Resolve an identifier, hold a list of instruments, or decide what a hit is. Recents and hotkeys are the palette's; a dialog around it is yours.
