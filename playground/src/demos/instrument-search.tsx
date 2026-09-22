import { useState } from "react"
import { recognizeQuery } from "@/registry/tradecn/lib/instrument-query"
import { InstrumentSearch, type InstrumentHit, type InstrumentSearchFn } from "@/registry/tradecn/ui/instrument-search"

// A pretend instrument master, 300 ms away, keyed the way a real one is: by CUSIP, by ISIN, by ticker, and by
// coupon and maturity for the Treasuries. Type "037833100", "US0378331005", "zn", or "4 1/8 05/34".

const MASTER: InstrumentHit[] = [
  { id: "t10", symbol: "T 4 1/8 05/34", name: "T 4 1/8 05/15/34", kind: "UST", cusip: "91282CKQ7", isin: "US91282CKQ71" },
  { id: "t5", symbol: "T 4 1/4 02/29", name: "T 4 1/4 02/15/29", kind: "UST", cusip: "91282CKG5", isin: "US91282CKG55" },
  { id: "t30", symbol: "T 4 5/8 05/54", name: "T 4 5/8 05/15/54", kind: "UST", cusip: "912810UA4", isin: "US912810UA43" },
  { id: "aapl", symbol: "AAPL", name: "Apple Inc.", kind: "Equity", exchange: "NASDAQ", cusip: "037833100", isin: "US0378331005" },
  { id: "msft", symbol: "MSFT", name: "Microsoft Corp.", kind: "Equity", exchange: "NASDAQ", cusip: "594918104", isin: "US5949181045" },
  { id: "zn", symbol: "ZN", name: "10-Year T-Note future", kind: "Future", exchange: "CBOT" },
  { id: "zb", symbol: "ZB", name: "30-Year T-Bond future", kind: "Future", exchange: "CBOT" },
]

const search: InstrumentSearchFn = (query, hint, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      if (hint.kind === "cusip") return resolve(MASTER.filter((h) => h.cusip === hint.cusip))
      if (hint.kind === "isin") return resolve(MASTER.filter((h) => h.isin === hint.isin))
      if (hint.kind === "coupon-maturity") return resolve(MASTER.filter((h) => h.kind === "UST" && h.name?.includes(`${hint.maturity?.slice(0, 2)}/`) && h.symbol.includes(String(hint.coupon).replace(".125", " 1/8").replace(".25", " 1/4").replace(".625", " 5/8"))))
      const q = query.trim().toUpperCase()
      resolve(MASTER.filter((h) => h.symbol.toUpperCase().startsWith(q) || h.name?.toUpperCase().includes(q)))
    }, 300)
    signal.addEventListener("abort", () => {
      clearTimeout(t)
      reject(new Error("aborted"))
    })
  })

export default function InstrumentSearchDemo() {
  const [picked, setPicked] = useState<string>("")
  return (
    <div className="flex flex-col gap-2 font-(family-name:--tradecn-font-mono) text-xs">
      <p className="text-muted-foreground">Try a ticker (zn), a CUSIP (037833100), an ISIN (US0378331005), or a coupon and maturity (4 1/8 05/34). {picked && `Picked ${picked}.`}</p>
      <InstrumentSearch search={search} onSelect={(hit, hint) => setPicked(`${hit.symbol} (read as ${recognizeQuery(hint.normalized).kind})`)} />
    </div>
  )
}
