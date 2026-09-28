import { useState } from "react"
import { Watchlist, WatchlistGrid, WatchlistAddForm, WatchlistAddInput, WatchlistAddButton, WatchlistRemoveMenuItem, watchlistColumns, watchlistRemoveColumn, type WatchlistRow } from "@/components/ui/watchlist"
import { createRowStore } from "@/lib/row-store"

const columns = [...watchlistColumns(), watchlistRemoveColumn()]

const ROWS: WatchlistRow[] = [
  { symbol: "ZN", last: 110.5, bid: 110.46875, ask: 110.53125, change: 0.25, changePct: 0.23, volume: 1_250_000 },
  { symbol: "ES", last: 5012.25, bid: 5012, ask: 5012.5, change: -12.5, changePct: -0.25, volume: 980_000 },
]

export function WatchlistScene() {
  const [store] = useState(() => {
    const s = createRowStore<WatchlistRow>({ getRowId: (r) => r.symbol })
    s.applyDeltas({ upsert: ROWS })
    return s
  })
  return (
    <div style={{ width: 640 }}>
      <button onClick={() => { store.applyDeltas({ remove: store.getIds(), upsert: Array.from({ length: 500 }, (_, i) => ({ symbol: `SYM${i}`, last: i })) }) }}>Load 500 quotes</button>
      <div style={{ height: 160 }}>
        <Watchlist store={store} onAdd={(symbol) => store.applyDeltas({ upsert: [{ symbol, last: 1 }] })} onRemove={(symbols) => store.applyDeltas({ remove: symbols })}>
          <WatchlistAddForm><WatchlistAddInput /><WatchlistAddButton /></WatchlistAddForm>
          <div className="h-32"><WatchlistGrid columns={columns} renderContextMenu={(_, ids) => <WatchlistRemoveMenuItem ids={ids} />} /></div>
        </Watchlist>
      </div>
    </div>
  )
}
