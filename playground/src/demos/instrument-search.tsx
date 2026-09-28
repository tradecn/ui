import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { CommandEmpty, CommandGroup } from "@/components/ui/command"
import { InstrumentSearch, InstrumentSearchContent, InstrumentSearchInput, InstrumentSearchList, InstrumentSearchItem, InstrumentSearchHint, useInstrumentSearchState, matchedIdentifier, type InstrumentHit, type InstrumentSearchFn } from "@/registry/tradecn/ui/instrument-search"

const instruments: InstrumentHit[] = [
  { id: "zn", symbol: "ZN", name: "T-Note future" },
  { id: "zb", symbol: "ZB", name: "T-Bond future" },
]
const search: InstrumentSearchFn = async (query) => instruments.filter((hit) => hit.symbol.startsWith(query.trim().toUpperCase()))

export default function InstrumentSearchDemo() {
  const [selected, setSelected] = useState("None")
  return <div className="min-h-56 w-sm max-w-full space-y-2 text-xs lining-nums tabular-nums">
    <InstrumentSearch search={search} onSelect={(hit) => setSelected(hit.symbol)} labels={{ placeholder: "Search ZN or ZB" }}>
      <InstrumentSearchContent>
        <InstrumentSearchInput />
        <InstrumentSearchList><InstrumentOptions /></InstrumentSearchList>
      </InstrumentSearchContent>
      <InstrumentSearchHint />
    </InstrumentSearch>
    <p role="status">Selected: {selected}</p>
  </div>
}

export function InstrumentOptions() {
  const { hits, loading, labels, emptyMessage } = useInstrumentSearchState()
  if (loading) return <p className="px-2 py-1.5 text-muted-foreground">{labels.searching}</p>
  if (!hits.length) return <CommandEmpty>{emptyMessage}</CommandEmpty>
  return <CommandGroup heading={labels.results}>
    {hits.map((hit) => <InstrumentSearchItem key={hit.id} hit={hit}><InstrumentHitContent hit={hit} /></InstrumentSearchItem>)}
  </CommandGroup>
}

export function InstrumentHitContent({ hit }: { hit: InstrumentHit }) {
  const { hint } = useInstrumentSearchState()
  const identifier = matchedIdentifier(hit, hint)
  return <span className="flex min-w-0 flex-1 items-center gap-2">
    <span className="font-semibold">{hit.symbol}</span>
    {hit.name && <span className="min-w-0 truncate text-muted-foreground">{hit.name}</span>}
    {identifier && <span className="font-(family-name:--tradecn-font-mono) text-muted-foreground lining-nums tabular-nums">{identifier}</span>}
    {hit.kind && <Badge variant="outline" className="ml-auto h-4 px-1 text-xs">{hit.kind}</Badge>}
  </span>
}
