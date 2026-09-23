import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { QuotePanel, type QuoteAction, type QuoteRow } from "@/registry/tradecn/blocks/quote-panel/quote-panel"
import { roundToTick, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import type { Limits } from "@/registry/tradecn/lib/limits"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import type { EditChange } from "@/registry/tradecn/ui/data-grid"

// Four notes quoted two-way over a pretend server that answers every command 300 ms later: a typed level,
// size, skew, or width is written back (a width over 8 is refused), a row's button moves its status word,
// and Pull all pulls every row the server allows it on. The market drifts while the walk runs; a Quoting
// row's levels follow it at the skew and the width. The line under the panel is the last command the
// server heard.

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const LIMITS: Limits = { maxDistance: { ticks: 4, level: "confirm" }, maxQuantity: { confirm: 50_000_000, block: 100_000_000 } }
const ALLOWED: Record<string, readonly string[]> = { Quoting: ["edit", "pause", "pull"], Paused: ["edit", "resume", "pull"], Pulled: ["edit", "resume"] }

function levels(row: QuoteRow): Pick<QuoteRow, "bid" | "ask"> {
  if (row.marketBid == null || row.marketAsk == null) return { bid: null, ask: null }
  const mid = (row.marketBid + row.marketAsk) / 2 + (row.skew ?? 0) * T32.tick
  const half = ((row.width ?? 2) / 2) * T32.tick
  return { bid: roundToTick(mid - half, T32.tick), ask: roundToTick(mid + half, T32.tick) }
}

function note(id: string, instrument: string, px: number, status: string, skew: number, width: number): QuoteRow {
  const row: QuoteRow = { id, instrument, status, marketBid: px - T32.tick, marketAsk: px, skew, width, bidSize: 25_000_000, askSize: 25_000_000, allowedActions: ALLOWED[status] }
  return { ...row, ...(status === "Pulled" ? { bid: null, ask: null } : levels(row)) }
}

const START: QuoteRow[] = [
  note("2Y", "T 4 1/4 02/15/29", 100.25, "Quoting", 0, 3),
  note("3Y", "T 4 02/15/28", 100.0625, "Quoting", 0, 3),
  note("5Y", "T 3 7/8 08/15/30", 99.75, "Quoting", 0.5, 4),
  note("7Y", "T 4 08/15/32", 99.625, "Paused", 0, 4),
  note("10Y", "T 4 1/8 05/15/34", 99.515625, "Quoting", 0, 4),
  note("30Y", "T 4 5/8 05/15/54", 98.6875, "Pulled", -1, 8),
]

function field(key: string, value: unknown): Partial<QuoteRow> {
  const n = typeof value === "number" ? value : null
  switch (key) {
    case "bid":
      return { bid: n }
    case "ask":
      return { ask: n }
    case "skew":
      return { skew: n }
    case "width":
      return { width: n }
    case "bidSize":
      return { bidSize: n }
    case "askSize":
      return { askSize: n }
    default:
      return {}
  }
}

function createServer(store: RowStore<QuoteRow>, heard: (line: string) => void) {
  const patch = (id: string, fields: Partial<QuoteRow>) => store.applyDeltas({ patch: [{ id, fields: { ...fields, updatedAt: Date.now() } }] })
  const setStatus = (id: string, status: string) =>
    setTimeout(() => {
      const row = store.getRow(id)
      if (!row) return
      patch(id, { status, allowedActions: ALLOWED[status], ...(status === "Quoting" ? levels({ ...row, status }) : status === "Pulled" ? { bid: null, ask: null } : {}) })
    }, 300)
  return {
    edit: (change: EditChange<QuoteRow>) => {
      heard(`${change.rowId}: ${change.key} → ${String(change.value)}`)
      return new Promise<void>((resolve, reject) =>
        setTimeout(() => {
          if (change.key === "width" && typeof change.value === "number" && change.value > 8) return reject(new Error("Risk declined a width over 8"))
          const row = store.getRow(change.rowId)
          if (!row) return resolve()
          const typed = field(change.key, change.value)
          patch(change.rowId, { ...typed, ...(row.status === "Quoting" && (change.key === "skew" || change.key === "width") ? levels({ ...row, ...typed }) : {}) })
          resolve()
        }, 300),
      )
    },
    act: (id: string, action: string) => {
      heard(`${id}: ${action}`)
      setStatus(id, action === "pause" ? "Paused" : action === "resume" ? "Quoting" : "Pulled")
    },
    pullAll: (rows: QuoteRow[]) => {
      heard(`pull all: ${rows.map((r) => r.id).join(", ")}`)
      for (const row of rows) setStatus(row.id, "Pulled")
    },
    drift() {
      const row = store.getRow(START[Math.floor(Math.random() * START.length)]!.id)
      if (!row || row.marketBid == null || row.marketAsk == null) return
      const by = (Math.random() < 0.5 ? -1 : 1) * T32.tick
      const moved = { ...row, marketBid: roundToTick(row.marketBid + by, T32.tick), marketAsk: roundToTick(row.marketAsk + by, T32.tick) }
      patch(row.id, { marketBid: moved.marketBid, marketAsk: moved.marketAsk, ...(row.status === "Quoting" ? levels(moved) : {}) })
    },
  }
}

export function QuotePanelScene() {
  const [store] = useState(() => {
    const s = createRowStore<QuoteRow>({ getRowId: (q) => q.id })
    s.applyDeltas({ upsert: START })
    return s
  })
  const [heard, setHeard] = useState("nothing yet")
  const [server] = useState(() => createServer(store, setHeard))
  const [actions] = useState<QuoteAction[]>(() => [
    { id: "pause", label: "Pause", run: (row) => server.act(row.id, "pause") },
    { id: "resume", label: "Resume", run: (row) => server.act(row.id, "resume") },
    { id: "pull", label: "Pull", destructive: true, run: (row) => server.act(row.id, "pull") },
  ])
  const [walking, setWalking] = useState(true)
  useEffect(() => {
    if (!walking) return
    const timer = setInterval(() => server.drift(), 800)
    return () => clearInterval(timer)
  }, [server, walking])
  return (
    <main className="flex h-screen flex-col gap-3 p-4 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">quote-panel</h1>
        <span className="text-muted-foreground">Double-click a level, a size, the skew, or the width to type it. A level over four ticks off the market asks again; a size over 100mm is refused; a width over 8 the server declines.</span>
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => setWalking((w) => !w)}>
          {walking ? "Pause the walk" : "Run the walk"}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <QuotePanel store={store} convention={T32} actions={actions} limits={LIMITS} onEdit={server.edit} onPullAll={server.pullAll} />
      </div>
      <p className="text-muted-foreground">
        The server heard: <span data-quote-heard="">{heard}</span>
      </p>
    </main>
  )
}
