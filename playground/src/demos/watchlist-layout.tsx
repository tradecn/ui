import { useId, useRef, useState, type Ref } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Watchlist, WatchlistGrid, WatchlistAddForm, WatchlistAddButton, WatchlistRemoveButton, useWatchlist, useWatchlistAdd, watchlistColumns, type WatchlistRow } from "@/registry/tradecn/ui/watchlist"

const quotes: WatchlistRow[] = [
  { symbol: "ES", last: 5012.25 },
  { symbol: "CL", last: 78.1 },
  { symbol: "GC", last: null },
]
const columns = watchlistColumns().slice(0, 2)

function SymbolSelect({ ref }: { ref: Ref<HTMLSelectElement> }) {
  const id = useId()
  const { draft, setDraft, invalid, canAdd } = useWatchlistAdd()
  return <div className="grid gap-1">
    <label htmlFor={id}>Instrument</label>
    <select ref={ref} id={id} value={draft} onChange={event => setDraft(event.target.value)} disabled={!canAdd} aria-invalid={invalid || undefined} className="h-7 rounded-sm border bg-background px-1 text-xs">
      <option value="">Choose symbol</option>
      {quotes.map(row => <option key={row.symbol} value={row.symbol}>{row.symbol}</option>)}
    </select>
  </div>
}

function SelectionActions({ focusInput }: { focusInput: () => void }) {
  const { selection } = useWatchlist()
  return <div className="flex flex-wrap items-center justify-between gap-2">
    <span className="text-muted-foreground">{selection.size} selected</span>
    <WatchlistRemoveButton ids={[...selection]} onClick={focusInput} className="rounded-sm border px-2 py-1 disabled:opacity-50">Remove selected</WatchlistRemoveButton>
  </div>
}

export default function WatchlistLayoutDemo() {
  const symbolInput = useRef<HTMLSelectElement>(null)
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set())
  const [store] = useState(() => {
    const store = createRowStore<WatchlistRow>({ getRowId: row => row.symbol })
    store.applyDeltas({ upsert: quotes.slice(0, 2) })
    return store
  })
  return <Watchlist store={store} selection={selection} onSelectionChange={setSelection} className="w-[32rem] max-w-full gap-3 sm:flex-row" onAdd={symbol => {
    const quote = quotes.find(row => row.symbol === symbol)
    if (quote) store.applyDeltas({ upsert: [quote] })
  }} onRemove={symbols => {
    store.applyDeltas({ remove: symbols })
    setSelection(current => new Set([...current].filter(id => !symbols.includes(id))))
  }}>
    <aside className="grid shrink-0 content-start gap-2 sm:w-36">
      <p className="font-medium">Metals & futures</p>
      <WatchlistAddForm onSubmit={() => symbolInput.current?.focus()} className="flex-col items-stretch gap-2">
        <SymbolSelect ref={symbolInput} />
        <WatchlistAddButton>Add to watchlist</WatchlistAddButton>
      </WatchlistAddForm>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="h-40"><WatchlistGrid columns={columns} selectionMode="multi" label="Watchlist instruments" /></div>
      <SelectionActions focusInput={() => symbolInput.current?.focus()} />
    </div>
  </Watchlist>
}
