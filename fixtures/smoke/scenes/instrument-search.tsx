import { useState } from "react"
import { InstrumentSearch, type InstrumentHit, type InstrumentSearchFn } from "@/components/ui/instrument-search"

const MASTER: InstrumentHit[] = [
  { id: "t10", symbol: "T 4 1/8 05/34", name: "T 4 1/8 05/15/34", kind: "UST", cusip: "91282CKQ7", isin: "US91282CKQ71" },
  { id: "aapl", symbol: "AAPL", name: "Apple Inc.", kind: "Equity", exchange: "NASDAQ", cusip: "037833100", isin: "US0378331005" },
  { id: "zn", symbol: "ZN", name: "10-Year T-Note future", kind: "Future", exchange: "CBOT" },
  { id: "zb", symbol: "ZB", name: "30-Year T-Bond future", kind: "Future", exchange: "CBOT" },
]

// A pretend instrument master 100 ms away, keyed by identifier, by coupon and maturity, and by ticker.
const search: InstrumentSearchFn = (query, hint) =>
  new Promise((resolve) =>
    setTimeout(() => {
      if (hint.kind === "cusip") return resolve(MASTER.filter((h) => h.cusip === hint.cusip))
      if (hint.kind === "isin") return resolve(MASTER.filter((h) => h.isin === hint.isin))
      if (hint.kind === "coupon-maturity") return resolve(MASTER.filter((h) => h.kind === "UST"))
      const q = query.trim().toUpperCase()
      resolve(MASTER.filter((h) => h.symbol.toUpperCase().startsWith(q)))
    }, 100),
  )

export function InstrumentSearchScene() {
  const [picked, setPicked] = useState("")
  return (
    <div className="w-[36rem]" data-instrument-picked={picked}>
      <InstrumentSearch search={search} onSelect={(hit, hint) => setPicked(`${hit.id}:${hint.kind}`)} />
    </div>
  )
}
