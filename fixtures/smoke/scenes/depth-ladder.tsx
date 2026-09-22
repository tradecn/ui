import { useState } from "react"
import { DepthLadder, levelId, type DepthLevel, type LadderStage } from "@/components/ui/depth-ladder"
import type { InstrumentConvention } from "@/lib/format"
import { createRowStore } from "@/lib/row-store"

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }

// 99-15 to 99-18 around an empty mid rung at 99-16+, the desk resting on both sides.
const LEVELS: DepthLevel[] = [
  { tick: 6368, bidSize: 120, myBid: 5 },
  { tick: 6367, bidSize: 80 },
  { tick: 6366, bidSize: 210 },
  { tick: 6370, askSize: 95 },
  { tick: 6371, askSize: 40, myAsk: 10 },
  { tick: 6372, askSize: 160 },
]

export function DepthLadderScene() {
  const [store] = useState(() => {
    const s = createRowStore<DepthLevel>({ getRowId: (level) => levelId(level.tick) })
    s.applyDeltas({ upsert: LEVELS })
    return s
  })
  const [mid, setMid] = useState(99.515625)
  const [staged, setStaged] = useState("")
  const onStage = (stage: LadderStage) => setStaged(`${stage.side} ${stage.price}`)
  return (
    <div className="flex flex-col gap-1">
      <div className="w-[20rem]" style={{ height: 240 }}>
        <DepthLadder store={store} convention={ZN} mid={mid} label="ZN ladder" depth={40} onStage={onStage} />
      </div>
      <output data-ladder-staged="">{staged}</output>
      <button type="button" onClick={() => store.applyDeltas({ patch: [{ id: levelId(6368), fields: { bidSize: 150 } }] })}>
        bid grows
      </button>
      <button type="button" onClick={() => setMid((m) => m + 2 / 64)}>
        mid moves up
      </button>
    </div>
  )
}
