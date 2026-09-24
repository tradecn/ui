import { useState } from "react"
import { CommandPalette, createActionRegistry } from "@/registry/tradecn/ui/command-palette"
import { toSymbolAdapter, type InstrumentHit, type InstrumentSearchFn } from "@/registry/tradecn/ui/instrument-search"

const instruments: InstrumentHit[] = [
  { id: "zn", symbol: "ZN", name: "T-Note future" },
  { id: "zb", symbol: "ZB", name: "T-Bond future" },
]
const search: InstrumentSearchFn = async (query) => {
  const prefix = query.trim().toUpperCase()
  return instruments.filter((hit) => hit.symbol.startsWith(prefix))
}
const symbols = toSymbolAdapter(search)

export default function InstrumentSearchPaletteDemo() {
  const [actions] = useState(() => createActionRegistry())
  const [selected, setSelected] = useState("None")
  return (
    <div className="min-h-64 w-sm max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <CommandPalette variant="go-bar" actions={actions} symbols={symbols} hotkey={false} onSymbolSelect={(hit) => setSelected(hit.symbol)} labels={{ title: "Find an instrument", placeholder: "Search ZN or ZB" }} />
      <p role="status">Selected: {selected}</p>
    </div>
  )
}
