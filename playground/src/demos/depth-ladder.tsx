import { useEffect, useState } from "react"
import type { InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createInstrumentFormatter } from "@/registry/tradecn/lib/format"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { DepthLadder, levelId, priceAtTick, tickIndexOf, type DepthLevel, type LadderStage } from "@/registry/tradecn/ui/depth-ladder"

// A ladder over a pretend book in ZN, twelve levels a side around an empty mid rung, the desk resting
// one tick behind the best on each side. Sizes move on a few levels every quarter second; every couple
// of seconds the market steps a tick and the book follows it. The ladder keeps the mid in the middle
// until you touch it; a click in the bid column stages a buy, in the ask column a sell, and the line
// under the ladder is where a ticket would take it from.

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const zn = createInstrumentFormatter(ZN)
const DEPTH = 12
const start = tickIndexOf(110.5, ZN.tick)

const size = () => 40 + Math.round(Math.random() * 400)

/** The book around a mid tick: bids below it, offers above it, the mid rung itself empty. */
function book(mid: number): DepthLevel[] {
  const levels: DepthLevel[] = []
  for (let i = 1; i <= DEPTH; i++) {
    levels.push({ tick: mid - i, bidSize: size(), myBid: i === 2 ? 25 : null })
    levels.push({ tick: mid + i, askSize: size(), myAsk: i === 2 ? 15 : null })
  }
  return levels
}

// The pretend feed: a few sizes change per tick of the clock, and now and then the whole book steps.
function useBook(store: RowStore<DepthLevel>) {
  const [midTick, setMidTick] = useState(start)
  useEffect(() => {
    let mid = start
    const sizes = setInterval(() => {
      const patch = []
      for (let n = 0; n < 3; n++) {
        const i = 1 + Math.floor(Math.random() * DEPTH)
        const side = Math.random() < 0.5 ? -1 : 1
        patch.push({ id: levelId(mid + side * i), fields: side < 0 ? { bidSize: size() } : { askSize: size() } })
      }
      store.applyDeltas({ patch })
    }, 250)
    const steps = setInterval(() => {
      const next = mid + (Math.random() < 0.5 ? -1 : 1)
      const gone = [levelId(mid - DEPTH), levelId(mid + DEPTH), levelId(next)]
      mid = next
      store.applyDeltas({ upsert: book(mid), remove: gone })
      setMidTick(mid)
    }, 2000)
    return () => {
      clearInterval(sizes)
      clearInterval(steps)
    }
  }, [store])
  return priceAtTick(midTick, ZN.tick)
}

export default function DepthLadderDemo() {
  const [store] = useState(() => {
    const s = createRowStore<DepthLevel>({ getRowId: (level) => levelId(level.tick) })
    s.applyDeltas({ upsert: book(start) })
    return s
  })
  const mid = useBook(store)
  const [staged, setStaged] = useState<LadderStage | null>(null)
  return (
    <div className="flex flex-col gap-2 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="h-80 w-72">
        <DepthLadder store={store} convention={ZN} mid={mid} label="ZN ladder" depth={60} onStage={setStaged} />
      </div>
      <p className="text-muted-foreground">
        {staged ? `Staged: ${staged.side} at ${zn.price(staged.price)}. Your ticket takes it from here.` : "Click a size to stage that price and side. Scroll or press a key to hold the ladder still."}
      </p>
    </div>
  )
}
