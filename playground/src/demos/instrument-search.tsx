import { useState } from "react"
import { InstrumentSearch, type InstrumentHit, type InstrumentSearchFn } from "@/registry/tradecn/ui/instrument-search"

const instruments: InstrumentHit[] = [
  { id: "zn", symbol: "ZN", name: "T-Note future" },
  { id: "zb", symbol: "ZB", name: "T-Bond future" },
]
const search: InstrumentSearchFn = async (query) => {
  const prefix = query.trim().toUpperCase()
  return instruments.filter((hit) => hit.symbol.startsWith(prefix))
}

export default function InstrumentSearchDemo() {
  const [selected, setSelected] = useState("None")
  return (
    <div className="min-h-56 w-sm max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <InstrumentSearch search={search} onSelect={(hit) => setSelected(hit.symbol)} labels={{ placeholder: "Search ZN or ZB" }} />
      <p role="status">Selected: {selected}</p>
    </div>
  )
}
