import { useEffect, useMemo, useState } from "react"
import { formatPrice, type PriceConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Sparkline } from "@/registry/tradecn/ui/sparkline"
import { Watchlist, watchlistColumns, type WatchlistRow } from "@/registry/tradecn/ui/watchlist"

interface Row extends WatchlistRow {
  close: number
  closes: number[]
}

const UNIVERSE: Record<string, { px: number; convention: PriceConvention }> = {
  ZT: { px: 102.25, convention: { kind: "fraction", denominator: 32, half: "+" } },
  ZF: { px: 106.5, convention: { kind: "fraction", denominator: 32, half: "+" } },
  ZN: { px: 110.5, convention: { kind: "fraction", denominator: 32, half: "+" } },
  ZB: { px: 118.75, convention: { kind: "fraction", denominator: 32, half: "+" } },
  ES: { px: 5012.25, convention: { kind: "decimal", decimals: 2 } },
  NQ: { px: 17650.5, convention: { kind: "decimal", decimals: 2 } },
  CL: { px: 78.1, convention: { kind: "decimal", decimals: 2 } },
  GC: { px: 2380.4, convention: { kind: "decimal", decimals: 1 } },
}

const price = (value: number, row: Row) => formatPrice(value, UNIVERSE[row.symbol]?.convention ?? { kind: "decimal", decimals: 2 })

function seed(symbol: string): Row {
  const px = UNIVERSE[symbol]!.px
  return { symbol, last: px, bid: px, ask: px, change: 0, changePct: 0, volume: 0, close: px, closes: [px] }
}

export function WatchlistScene() {
  const [store] = useState(() => {
    const s = createRowStore<Row>({ getRowId: (r) => r.symbol })
    s.applyDeltas({ upsert: ["ZN", "ZB", "ES", "CL"].map(seed) })
    return s
  })
  const [log, setLog] = useState("Enter or double-click a row to load it.")
  useEffect(() => {
    const t = setInterval(() => {
      const patch = store.getIds().flatMap((id) => {
        const row = store.getRow(id)
        if (!row || Math.random() > 0.5) return []
        const step = row.close * 0.0004
        const last = Number(((row.last ?? row.close) + (Math.random() - 0.5) * step).toFixed(4))
        return [{ id, fields: { last, bid: last - step / 8, ask: last + step / 8, change: last - row.close, changePct: ((last - row.close) / row.close) * 100, volume: (row.volume ?? 0) + Math.round(Math.random() * 900), closes: [...row.closes.slice(-59), last] } }]
      })
      store.applyDeltas({ patch })
    }, 400)
    return () => clearInterval(t)
  }, [store])
  const columns = useMemo(() => [...watchlistColumns<Row>({ price }), { key: "trend", header: "Trend", width: 112, flash: false as const, accessor: (r: Row) => r.closes, cell: ({ row }: { row: Row }) => <Sparkline values={row.closes} baseline={row.close} label={`${row.symbol} today`} width={96} height={16} /> }], [])
  return (
    <main className="mx-auto max-w-3xl space-y-3 p-6 font-(family-name:--tradecn-font-mono) text-xs">
      <h1 className="text-sm font-semibold">watchlist</h1>
      <p className="text-muted-foreground">Add one of {Object.keys(UNIVERSE).join(", ")}. Add one that is already there and it goes to that row instead. Anything else is refused. Delete removes the row in hand, so does the × on hover and the right-click menu. Treasuries print in 32nds and the rest in decimals, through one `price` function. The trend column is a sparkline spread into the default columns.</p>
      <div className="h-72">
        <Watchlist
          store={store}
          columns={columns}
          validate={(symbol) => symbol in UNIVERSE}
          onAdd={(symbol) => store.applyDeltas({ upsert: [seed(symbol)] })}
          onRemove={(symbols) => store.applyDeltas({ remove: symbols })}
          onRowActivate={(row) => setLog(`load ${row.symbol}`)}
        />
      </div>
      <p className="text-muted-foreground">{log}</p>
    </main>
  )
}
