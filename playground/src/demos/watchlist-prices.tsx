import { useState } from "react"
import { formatPrice } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Watchlist, type WatchlistRow } from "@/registry/tradecn/ui/watchlist"

const price = (value: number, row: WatchlistRow) => formatPrice(value, row.symbol === "ZN" ? { kind: "fraction", denominator: 32, half: "+" } : { kind: "decimal", decimals: 2 })

export default function WatchlistPricesDemo() {
  const [store] = useState(() => {
    const store = createRowStore<WatchlistRow>({ getRowId: (row) => row.symbol })
    store.applyDeltas({ upsert: [
      { symbol: "ZN", last: 110.5, bid: 110.484375, ask: 110.515625, change: 0.25, changePct: 0.23, volume: 1_250_000 },
      { symbol: "ES", last: 5012.25, bid: 5012, ask: 5012.5, change: -12.5, changePct: -0.25, volume: 980_000 },
    ] })
    return store
  })
  return <div className="h-40 w-fit max-w-full"><Watchlist store={store} price={price} label="Prices by instrument" /></div>
}
