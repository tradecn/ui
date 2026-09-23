import { useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore, type DeltaBatch } from "@/registry/tradecn/lib/row-store"
import { DepthLadder, levelId, tickIndexOf, type DepthLevel } from "@/registry/tradecn/ui/depth-ladder"

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const mid = 110.5
const tick = tickIndexOf(mid, ZN.tick)
const levels: DepthLevel[] = [
  { tick: tick - 2, bidSize: 300, myBid: 25 },
  { tick: tick - 1, bidSize: 220 },
  { tick: tick + 1, askSize: 180 },
  { tick: tick + 2, askSize: 320, myAsk: 15 },
]
const updates: { message: string; batch: DeltaBatch<DepthLevel> }[] = [
  { message: "Bid at 110-15+: 300. Ask at 110-16+: 120.", batch: { patch: [{ id: levelId(tick - 1), fields: { bidSize: 300 } }, { id: levelId(tick + 1), fields: { askSize: 120 } }] } },
  { message: "Own bid: 40. Own ask: cleared. Market sizes unchanged.", batch: { patch: [{ id: levelId(tick - 2), fields: { myBid: 40 } }, { id: levelId(tick + 2), fields: { myAsk: 0 } }] } },
  { message: "New ask: 90 at 110-17+.", batch: { upsert: [{ tick: tick + 3, askSize: 90 }] } },
  { message: "Bid at 110-15+ removed. Its price rung remains.", batch: { remove: [levelId(tick - 1)] } },
]

export default function DepthLadderUpdatesDemo() {
  const [store] = useState(() => {
    const store = createRowStore<DepthLevel>({ getRowId: (level) => levelId(level.tick) })
    store.applyDeltas({ upsert: levels })
    return store
  })
  const [step, setStep] = useState(0)
  const advance = () => {
    const update = updates[step]
    if (!update) return
    store.applyDeltas(update.batch)
    setStep(step + 1)
  }
  const restore = () => {
    store.applyDeltas({ upsert: levels, remove: [levelId(tick + 3)] })
    setStep(0)
  }
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border px-2 py-1 disabled:opacity-50" disabled={step === updates.length} onClick={advance}>Apply next book update</button>
        <button type="button" className="rounded border px-2 py-1" onClick={restore}>Restore book</button>
      </div>
      <div className="w-72 max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <div className="h-56">
          <DepthLadder store={store} convention={ZN} mid={mid} label="ZN book updates" depth={4} />
        </div>
        <p role="status" className="text-muted-foreground">{step === 0 ? "Initial book." : `Update ${step} of ${updates.length}. ${updates[step - 1]!.message}`}</p>
      </div>
    </>
  )
}
