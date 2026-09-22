import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { createInstrumentFormatter, type InstrumentConvention } from "@/registry/tradecn/lib/format"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { DepthLadder, levelId, priceAtTick, tickIndexOf, type DepthLevel, type LadderStage } from "@/registry/tradecn/ui/depth-ladder"

// Two ladders over pretend books, ZN in 32nds and a bill on a decimal tick, each fed by its own
// simulated market: sizes change on a few levels every quarter second, and the market steps a tick
// when you press the buttons or, with the walk running, on its own. The desk rests one tick behind the
// best on each side. A click in a size column stages a price and a side into the log; the ladder sends
// nothing.

const ZN: InstrumentConvention = { price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 }
const BILL: InstrumentConvention = { price: { kind: "tick", tick: 0.0005 }, tick: 0.0005, quoteBasis: "discount" }
const DEPTH = 12

const size = () => 40 + Math.round(Math.random() * 400)

function book(mid: number): DepthLevel[] {
  const levels: DepthLevel[] = []
  for (let i = 1; i <= DEPTH; i++) {
    levels.push({ tick: mid - i, bidSize: size(), myBid: i === 2 ? 25 : null })
    levels.push({ tick: mid + i, askSize: size(), myAsk: i === 2 ? 15 : null })
  }
  return levels
}

interface Market {
  store: RowStore<DepthLevel>
  midTick: number
  step(by: number): void
}

function useMarket(startTick: number, walking: boolean): Market {
  const [store] = useState(() => {
    const s = createRowStore<DepthLevel>({ getRowId: (level) => levelId(level.tick) })
    s.applyDeltas({ upsert: book(startTick) })
    return s
  })
  const [midTick, setMidTick] = useState(startTick)
  const mid = useRef(startTick)
  const step = (by: number) => {
    const next = mid.current + by
    const gone = [levelId(mid.current - DEPTH), levelId(mid.current + DEPTH), levelId(next)]
    mid.current = next
    store.applyDeltas({ upsert: book(next), remove: gone })
    setMidTick(next)
  }
  const stepRef = useRef(step)
  useEffect(() => {
    stepRef.current = step
  })
  useEffect(() => {
    const sizes = setInterval(() => {
      const patch = []
      for (let n = 0; n < 3; n++) {
        const i = 1 + Math.floor(Math.random() * DEPTH)
        const side = Math.random() < 0.5 ? -1 : 1
        patch.push({ id: levelId(mid.current + side * i), fields: side < 0 ? { bidSize: size() } : { askSize: size() } })
      }
      store.applyDeltas({ patch })
    }, 250)
    return () => clearInterval(sizes)
  }, [store])
  useEffect(() => {
    if (!walking) return
    const walk = setInterval(() => stepRef.current(Math.random() < 0.5 ? -1 : 1), 2000)
    return () => clearInterval(walk)
  }, [walking])
  return { store, midTick, step }
}

function Ladder({ name, convention, market, onStage }: { name: string; convention: InstrumentConvention; market: Market; onStage: (stage: LadderStage) => void }) {
  return (
    <div className="flex min-h-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">{name}</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => market.step(1)}>
          Mid up
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => market.step(-1)}>
          Mid down
        </Button>
      </div>
      <div className="min-h-0 w-72 flex-1">
        <DepthLadder store={market.store} convention={convention} mid={priceAtTick(market.midTick, convention.tick)} label={`${name} ladder`} depth={80} onStage={onStage} />
      </div>
    </div>
  )
}

export function DepthLadderScene() {
  const [walking, setWalking] = useState(true)
  const [log, setLog] = useState("")
  const zn = useMarket(tickIndexOf(110.5, ZN.tick), walking)
  const bill = useMarket(tickIndexOf(5.235, BILL.tick), walking)
  const staged = (name: string, convention: InstrumentConvention) => (stage: LadderStage) => setLog(`${name}: ${stage.side} at ${createInstrumentFormatter(convention).price(stage.price)} (tick ${stage.tick}); your ticket takes it from here`)
  return (
    <main className="flex h-screen flex-col gap-3 p-4 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">depth-ladder</h1>
        <span className="text-muted-foreground">The mid stays in the middle until you touch the ladder; Recenter or Home puts it back. Click a size to stage that price and side.</span>
        <span className="ml-auto text-muted-foreground">{log}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setWalking((w) => !w)}>
          {walking ? "Pause the walk" : "Run the walk"}
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 gap-6">
        <Ladder name="ZN" convention={ZN} market={zn} onStage={staged("ZN", ZN)} />
        <Ladder name="Bill" convention={BILL} market={bill} onStage={staged("Bill", BILL)} />
      </div>
    </main>
  )
}
