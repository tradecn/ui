import { useState } from "react"
import { DepthLadder, DepthLadderHeader, DepthLadderColumnHeader, DepthLadderViewport, DepthLadderEmpty, DepthLadderRows, DepthLadderRow, DepthLadderSizeCell, DepthLadderPriceCell, DepthLadderRecenter, DepthLadderOwnSize, DepthLadderSize, levelId, type DepthLevel, type LadderStage } from "@/components/ui/depth-ladder"
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

function renderLadderRow() {
  return (
    <DepthLadderRow>
      <DepthLadderSizeCell side="bid" />
      <DepthLadderPriceCell />
      <DepthLadderSizeCell side="ask" />
    </DepthLadderRow>
  )
}

const ALTERNATE_COLUMNS = ["price", "bid", "ask"] as const

function renderAlternateRow() {
  return <DepthLadderRow>
    <DepthLadderPriceCell />
    <DepthLadderSizeCell side="bid"><DepthLadderSize side="bid" /><DepthLadderOwnSize side="bid" /></DepthLadderSizeCell>
    <DepthLadderSizeCell side="ask"><DepthLadderSize side="ask" /><DepthLadderOwnSize side="ask" /></DepthLadderSizeCell>
  </DepthLadderRow>
}

export function DepthLadderScene() {
  const [store] = useState(() => {
    const s = createRowStore<DepthLevel>({ getRowId: (level) => levelId(level.tick) })
    s.applyDeltas({ upsert: LEVELS })
    return s
  })
  const [mid, setMid] = useState<number | null>(99.515625)
  const [staged, setStaged] = useState("")
  const [recenterDisabled, setRecenterDisabled] = useState(false)
  const [stageCount, setStageCount] = useState(0)
  const onStage = (stage: LadderStage) => { setStaged(`${stage.side} ${stage.price}`); setStageCount((count) => count + 1) }
  return (
    <div className="flex flex-col gap-1">
      <div className="w-[20rem]" style={{ height: 240 }}>
        <DepthLadder store={store} convention={ZN} mid={mid} label="ZN ladder" depth={40} onStage={onStage}>
          <DepthLadderHeader>
            <DepthLadderColumnHeader column="bid" />
            <DepthLadderColumnHeader column="price" />
            <DepthLadderColumnHeader column="ask" />
          </DepthLadderHeader>
          <DepthLadderViewport>
            <DepthLadderEmpty />
            <DepthLadderRows>{renderLadderRow}</DepthLadderRows>
          </DepthLadderViewport>
          <DepthLadderRecenter disabled={recenterDisabled} className="absolute bottom-2 left-1/2 z-30 -translate-x-1/2" />
        </DepthLadder>
      </div>
      <output data-ladder-staged="">{staged}</output>
      <output data-ladder-stage-count="">{stageCount}</output>
      <button type="button" onClick={() => store.applyDeltas({ patch: [{ id: levelId(6368), fields: { bidSize: 150 } }] })}>
        bid grows
      </button>
      <button type="button" onClick={() => setMid((m) => (m ?? 99.515625) + 2 / 64)}>
        mid moves up
      </button>
      <button type="button" onClick={() => setMid(null)}>clear market</button>
      <button type="button" onClick={() => setRecenterDisabled((disabled) => !disabled)}>{recenterDisabled ? "enable recenter" : "disable recenter"}</button>
      <DepthLadder store={store} convention={ZN} mid={mid} label="ZN alternate ladder" depth={40} order="ascending" columns={ALTERNATE_COLUMNS} onStage={onStage} className="h-64 w-80">
        <div className="flex h-10 shrink-0 items-center justify-between px-2"><span>ZN desk</span><DepthLadderRecenter>Follow market</DepthLadderRecenter></div>
        <DepthLadderHeader><DepthLadderColumnHeader column="price" /><DepthLadderColumnHeader column="bid" /><DepthLadderColumnHeader column="ask" /></DepthLadderHeader>
        <DepthLadderViewport><DepthLadderEmpty /><DepthLadderRows>{renderAlternateRow}</DepthLadderRows></DepthLadderViewport>
      </DepthLadder>
    </div>
  )
}
