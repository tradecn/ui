import { useState } from "react"
import { createInstrumentFormatter, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DepthLadder, levelId, priceAtTick, tickIndexOf, type DepthLevel } from "@/registry/tradecn/ui/depth-ladder"

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const format = createInstrumentFormatter(ZN)
const start = tickIndexOf(110.5, ZN.tick)
const levelsAt = (mid: number): DepthLevel[] => [{ tick: mid - 1, bidSize: 220 }, { tick: mid + 1, askSize: 180 }]

export default function DepthLadderFollowingDemo() {
  const [store] = useState(() => {
    const store = createRowStore<DepthLevel>({ getRowId: (level) => levelId(level.tick) })
    store.applyDeltas({ upsert: levelsAt(start) })
    return store
  })
  const [midTick, setMidTick] = useState(start)
  const move = (by: number) => {
    const next = midTick + by
    const levels = levelsAt(next)
    const ids = new Set(levels.map((level) => levelId(level.tick)))
    store.applyDeltas({ upsert: levels, remove: store.getIds().filter((id) => !ids.has(id)) })
    setMidTick(next)
  }
  const mid = priceAtTick(midTick, ZN.tick)
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs lining-nums tabular-nums">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={midTick === start + 8} onClick={() => move(4)}>Move market up 4 ticks</button>
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={midTick === start - 8} onClick={() => move(-4)}>Move market down 4 ticks</button>
      </div>
      <div className="w-72 max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <div className="h-64">
          <DepthLadder store={store} convention={ZN} mid={mid} label="ZN moving market" depth={12} />
        </div>
        <p role="status" className="text-muted-foreground">Market mid: {format.price(mid)}.</p>
      </div>
    </>
  )
}
