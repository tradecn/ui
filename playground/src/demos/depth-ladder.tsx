import { useState } from "react"
import { createInstrumentFormatter, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DepthLadder, levelId, tickIndexOf, type DepthLevel, type LadderStage } from "@/registry/tradecn/ui/depth-ladder"

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const format = createInstrumentFormatter(ZN)
const mid = 110.5
const tick = tickIndexOf(mid, ZN.tick)

export default function DepthLadderDemo() {
  const [store] = useState(() => {
    const store = createRowStore<DepthLevel>({ getRowId: (level) => levelId(level.tick) })
    store.applyDeltas({ upsert: [
      { tick: tick - 2, bidSize: 300, myBid: 25 },
      { tick: tick - 1, bidSize: 220 },
      { tick: tick + 1, askSize: 180 },
      { tick: tick + 2, askSize: 320, myAsk: 15 },
    ] })
    return store
  })
  const [staged, setStaged] = useState<LadderStage | null>(null)
  return (
    <div className="w-72 max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <div className="h-56">
        <DepthLadder store={store} convention={ZN} mid={mid} label="ZN ladder" depth={4} onStage={setStaged} />
      </div>
      <p role="status" className="text-muted-foreground">{staged ? `Staged: ${staged.side} at ${format.price(staged.price)}.` : "Nothing staged."}</p>
    </div>
  )
}
