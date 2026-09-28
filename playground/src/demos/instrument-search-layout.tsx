import { useRef, useState, type RefObject } from "react"
import { CommandEmpty, CommandGroup } from "@/components/ui/command"
import { InstrumentSearch, InstrumentSearchContent, InstrumentSearchInput, InstrumentSearchList, InstrumentSearchItem, InstrumentSearchHint, useInstrumentSearchState, type InstrumentHit, type InstrumentSearchFn } from "@/registry/tradecn/ui/instrument-search"

const instruments: InstrumentHit[] = [
  { id: "zn", symbol: "ZN", name: "T-Note future", exchange: "CBOT" },
  { id: "zb", symbol: "ZB", name: "T-Bond future", exchange: "CBOT" },
]
const search: InstrumentSearchFn = async (query) => instruments.filter((hit) => hit.symbol.startsWith(query.trim().toUpperCase()))

export default function InstrumentSearchLayoutDemo() {
  const [query, setQuery] = useState("z")
  const [selected, setSelected] = useState("None")
  const input = useRef<HTMLInputElement>(null)
  return (
    <InstrumentSearch search={search} query={query} onQueryChange={setQuery} onSelect={(hit) => setSelected(hit.symbol)} clearOnSelect={false} className="min-h-56 w-xl max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-semibold">Choose a contract</h3><p role="status" className="text-muted-foreground">Selected: {selected}</p></div>
        <ClearQuery input={input} />
      </div>
      <InstrumentSearchContent label="Choose a contract" className="grid gap-3 p-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2"><InstrumentSearchInput ref={input} /><InstrumentSearchHint /></div>
        <InstrumentSearchList label="Contracts" className="min-w-0"><ContractOptions /></InstrumentSearchList>
      </InstrumentSearchContent>
    </InstrumentSearch>
  )
}

function ClearQuery({ input }: { input: RefObject<HTMLInputElement | null> }) {
  const { setQuery } = useInstrumentSearchState()
  return <button type="button" className="rounded border border-border px-2 py-1" onClick={() => { setQuery(""); input.current?.focus() }}>Clear search</button>
}

function ContractOptions() {
  const { hits, loading, labels, emptyMessage } = useInstrumentSearchState()
  if (loading) return <p className="text-muted-foreground">{labels.searching}</p>
  if (!hits.length) return <CommandEmpty>{emptyMessage}</CommandEmpty>
  return <CommandGroup heading="Contracts">
    {hits.toReversed().map((hit) => <InstrumentSearchItem key={hit.id} hit={hit} className="items-start">
      <span className="min-w-0 flex-1"><span className="block text-muted-foreground">{hit.name}</span><strong>{hit.symbol}</strong></span>
      <span>{hit.exchange}</span>
    </InstrumentSearchItem>)}
  </CommandGroup>
}
