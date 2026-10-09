import { useMemo, useState } from "react"
import { ContextMenuSeparator } from "@/components/ui/context-menu"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Watchlist, WatchlistGrid, WatchlistAddForm, WatchlistAddInput, WatchlistAddButton, WatchlistAddStatus, WatchlistRemoveMenuItem, watchlistColumns, watchlistRemoveColumn, type WatchlistGridProps, type WatchlistRow } from "@/registry/tradecn/ui/watchlist"

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
