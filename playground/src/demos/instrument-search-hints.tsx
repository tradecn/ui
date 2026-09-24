import { useState } from "react"
import { InstrumentSearch, type InstrumentHit, type InstrumentSearchFn } from "@/registry/tradecn/ui/instrument-search"

type SampleInstrument = InstrumentHit & {
  ticker?: string
  coupon?: number
  maturity?: { month: number; day: number; year: number }
}
const instruments: SampleInstrument[] = [
  { id: "aapl", symbol: "AAPL", cusip: "037833100", isin: "US0378331005" },
  { id: "treasury", symbol: "T 4 1/8 05/34", ticker: "T", coupon: 4.125, maturity: { month: 5, day: 15, year: 2034 } },
]
const queries = [
  { label: "CUSIP example", query: "037833100" },
  { label: "ISIN example", query: "US0378331005" },
  { label: "Coupon example", query: "4 1/8 05/34" },
]

const search: InstrumentSearchFn = async (query, hint, signal) => {
  // A delayed local lookup stands in for a request to your instrument service.
  await new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort)
      resolve()
    }, 300)
    function abort() {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener("abort", abort, { once: true })
  })
  signal.throwIfAborted()
  if (hint.kind === "cusip") return instruments.filter((hit) => hit.cusip === hint.cusip)
  if (hint.kind === "isin") return instruments.filter((hit) => hit.isin === hint.isin)
  if (hint.kind === "coupon-maturity" && hint.maturityParts) {
    const { month, day, year } = hint.maturityParts
    const fullYear = year < 100 ? 2000 + year : year
    return instruments.filter((hit) => hit.coupon === hint.coupon && hit.maturity?.month === month && hit.maturity.year === fullYear && (day === undefined || hit.maturity.day === day) && (!hint.ticker || hit.ticker === hint.ticker))
  }
  return instruments.filter((hit) => hit.symbol.startsWith(query.trim().toUpperCase()))
}

export default function InstrumentSearchHintsDemo() {
  const [query, setQuery] = useState("037833100")
  const [selected, setSelected] = useState("None")
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        {queries.map((example) => <button key={example.label} type="button" className="rounded border border-border px-2 py-1" onClick={() => setQuery(example.query)}>{example.label}</button>)}
      </div>
      <div className="min-h-56 w-sm max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <InstrumentSearch search={search} query={query} onQueryChange={setQuery} onSelect={(hit, hint) => setSelected(`${hit.symbol} (${hint.kind})`)} labels={{ placeholder: "Identifier or coupon and maturity" }} />
        <p role="status">Selected: {selected}</p>
      </div>
    </>
  )
}
