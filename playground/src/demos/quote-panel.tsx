import { useEffect, useState } from "react"
import { QuotePanel, type QuoteAction, type QuoteRow } from "@/registry/tradecn/blocks/quote-panel/quote-panel"
import { roundToTick, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import type { Limits } from "@/registry/tradecn/lib/limits"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import type { EditChange } from "@/registry/tradecn/ui/data-grid"

// Four notes quoted two-way by a pretend desk over a pretend server. The market drifts a tick now and then,
// and while a row is Quoting the server keeps the desk's levels the skew and the width off the market's mid.
// Typing a level, a size, the skew, or the width sends it to the server, which writes the row back a moment
// later or refuses it; the buttons are the actions the server allows on the row, and every status word is
// the server's. The limits ask about a level more than four ticks off the market and stop a size over 100mm.

const T32: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const LIMITS: Limits = { maxDistance: { ticks: 4, level: "confirm" }, maxQuantity: { confirm: 50_000_000, block: 100_000_000 } }
const ALLOWED: Record<string, readonly string[]> = { Quoting: ["edit", "pause", "pull"], Paused: ["edit", "resume", "pull"], Pulled: ["edit", "resume"] }

/** The desk's two-way from the market's mid, the skew, and the width, on the grid. */
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
  note("5Y", "T 3 7/8 08/15/30", 99.75, "Quoting", 0.5, 4),
  note("10Y", "T 4 1/8 05/15/34", 99.515625, "Paused", 0, 4),
  note("30Y", "T 4 5/8 05/15/54", 98.6875, "Pulled", -1, 8),
]

/** One typed field as a patch, so the server writes back exactly what was typed. */
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

// The pretend server: every command lands 300 ms later as a batch on the store, or is refused.
function createServer(store: RowStore<QuoteRow>) {
  const patch = (id: string, fields: Partial<QuoteRow>) => store.applyDeltas({ patch: [{ id, fields: { ...fields, updatedAt: Date.now() } }] })
  const setStatus = (id: string, status: string) =>
    setTimeout(() => {
      const row = store.getRow(id)
      if (!row) return
      const next = { ...row, status }
      patch(id, { status, allowedActions: ALLOWED[status], ...(status === "Quoting" ? levels(next) : status === "Pulled" ? { bid: null, ask: null } : {}) })
    }, 300)
  return {
    edit: (change: EditChange<QuoteRow>) =>
      new Promise<void>((resolve, reject) =>
        setTimeout(() => {
          if (change.key === "width" && typeof change.value === "number" && change.value > 8) return reject(new Error("Risk declined a width over 8"))
          const row = store.getRow(change.rowId)
          if (!row) return resolve()
          const typed = field(change.key, change.value)
          const next = { ...row, ...typed }
          patch(change.rowId, { ...typed, ...(row.status === "Quoting" && (change.key === "skew" || change.key === "width") ? levels(next) : {}) })
          resolve()
        }, 300),
      ),
    pause: (id: string) => {
      setStatus(id, "Paused")
    },
    resume: (id: string) => {
      setStatus(id, "Quoting")
    },
    pull: (id: string) => {
      setStatus(id, "Pulled")
    },
    // The market: one note a tick either way, its Quoting levels following.
    drift() {
      const row = store.getRow(START[Math.floor(Math.random() * START.length)]!.id)
      if (!row || row.marketBid == null || row.marketAsk == null) return
      const by = (Math.random() < 0.5 ? -1 : 1) * T32.tick
      const moved = { ...row, marketBid: roundToTick(row.marketBid + by, T32.tick), marketAsk: roundToTick(row.marketAsk + by, T32.tick) }
      patch(row.id, { marketBid: moved.marketBid, marketAsk: moved.marketAsk, ...(row.status === "Quoting" ? levels(moved) : {}) })
    },
  }
}

export default function QuotePanelDemo() {
  const [store] = useState(() => {
    const s = createRowStore<QuoteRow>({ getRowId: (q) => q.id })
    s.applyDeltas({ upsert: START })
    return s
  })
  const [server] = useState(() => createServer(store))
  const [actions] = useState<QuoteAction[]>(() => [
    { id: "pause", label: "Pause", run: (row) => server.pause(row.id) },
    { id: "resume", label: "Resume", run: (row) => server.resume(row.id) },
    { id: "pull", label: "Pull", destructive: true, run: (row) => server.pull(row.id) },
  ])
  useEffect(() => {
    const timer = setInterval(() => server.drift(), 800)
    return () => clearInterval(timer)
  }, [server])
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="h-56">
        <QuotePanel store={store} convention={T32} actions={actions} limits={LIMITS} onEdit={server.edit} onPullAll={(rows) => rows.forEach((row) => server.pull(row.id))} />
      </div>
      <p className="text-muted-foreground">Double-click a level, a size, the skew, or the width to type it; the server writes it back. A level more than four ticks off the market asks again, a width over 8 is refused, and Pull all asks before it pulls.</p>
    </div>
  )
}
