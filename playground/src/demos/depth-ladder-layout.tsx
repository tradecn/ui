import { useState } from "react"
import { NUMERIC_CLASS, createInstrumentFormatter, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DepthLadder, DepthLadderColumnHeader, DepthLadderEmpty, DepthLadderHeader, DepthLadderOwnSize, DepthLadderPriceCell, DepthLadderRecenter, DepthLadderRow, DepthLadderRows, DepthLadderSize, DepthLadderSizeCell, DepthLadderViewport, levelId, tickIndexOf, type DepthLevel, type LadderColumn, type LadderStage } from "@/registry/tradecn/ui/depth-ladder"

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const format = createInstrumentFormatter(ZN)
const mid = 110.5
const tick = tickIndexOf(mid, ZN.tick)
const columns: readonly LadderColumn[] = ["price", "bid", "ask"]

function renderRow() {
  return <DepthLadderRow>
    <DepthLadderPriceCell className="justify-start font-medium" />
    <DepthLadderSizeCell side="bid"><DepthLadderSize side="bid" /><DepthLadderOwnSize side="bid" /></DepthLadderSizeCell>
    <DepthLadderSizeCell side="ask"><DepthLadderSize side="ask" /><DepthLadderOwnSize side="ask" /></DepthLadderSizeCell>
  </DepthLadderRow>
}

export default function DepthLadderLayoutDemo() {
  const [store] = useState(() => {
    const store = createRowStore<DepthLevel>({ getRowId: (level) => levelId(level.tick) })
    store.applyDeltas({ upsert: [{ tick: tick - 1, bidSize: 220, myBid: 25 }, { tick: tick + 1, askSize: 180, myAsk: 15 }] })
    return store
  })
  const [staged, setStaged] = useState<LadderStage | null>(null)
  return <div className="w-80 max-w-full space-y-2 text-xs lining-nums tabular-nums">
    <DepthLadder store={store} convention={ZN} mid={mid} label="ZN ascending ladder" depth={4} columns={columns} order="ascending" rowHeight={28} onStage={setStaged} className="h-80">
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-2">
        <span className="font-medium">ZN · Ascending prices</span>
        <DepthLadderRecenter variant="outline">Follow mid</DepthLadderRecenter>
      </div>
      <DepthLadderHeader>
        <DepthLadderColumnHeader column="price" className="justify-start" />
        <DepthLadderColumnHeader column="bid" />
        <DepthLadderColumnHeader column="ask" />
      </DepthLadderHeader>
      <DepthLadderViewport>
        <DepthLadderEmpty>Waiting for ZN</DepthLadderEmpty>
        <DepthLadderRows>{renderRow}</DepthLadderRows>
      </DepthLadderViewport>
    </DepthLadder>
    <p role="status" className={`text-muted-foreground ${NUMERIC_CLASS}`}>{staged ? `Staged: ${staged.side} at ${format.price(staged.price)}.` : "Nothing staged."}</p>
  </div>
}
