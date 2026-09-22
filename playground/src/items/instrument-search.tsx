import { useMemo, useState } from "react"
import { QUERY_KIND_LABELS, recognizeQuery } from "@/registry/tradecn/lib/instrument-query"
import { CommandPalette, createActionRegistry } from "@/registry/tradecn/ui/command-palette"
import { InstrumentSearch, toSymbolAdapter, type InstrumentHit, type InstrumentSearchFn } from "@/registry/tradecn/ui/instrument-search"

// One search function, three places: the field, the palette's symbol rows (mod+k), and a raw readout of what the
// recognizer makes of the text as it is typed. A pretend instrument master 300 ms away answers all of them.

const MASTER: InstrumentHit[] = [
  { id: "t10", symbol: "T 4 1/8 05/34", name: "T 4 1/8 05/15/34", kind: "UST", cusip: "91282CKQ7", isin: "US91282CKQ71" },
  { id: "t5", symbol: "T 4 1/4 02/29", name: "T 4 1/4 02/15/29", kind: "UST", cusip: "91282CKG5", isin: "US91282CKG55" },
  { id: "t30", symbol: "T 4 5/8 05/54", name: "T 4 5/8 05/15/54", kind: "UST", cusip: "912810UA4", isin: "US912810UA43" },
  { id: "aapl", symbol: "AAPL", name: "Apple Inc.", kind: "Equity", exchange: "NASDAQ", cusip: "037833100", isin: "US0378331005" },
  { id: "msft", symbol: "MSFT", name: "Microsoft Corp.", kind: "Equity", exchange: "NASDAQ", cusip: "594918104", isin: "US5949181045" },
  { id: "brkb", symbol: "BRK.B", name: "Berkshire Hathaway Inc. Class B", kind: "Equity", exchange: "NYSE", cusip: "084670702", isin: "US0846707026" },
  { id: "zn", symbol: "ZN", name: "10-Year T-Note future", kind: "Future", exchange: "CBOT" },
  { id: "zb", symbol: "ZB", name: "30-Year T-Bond future", kind: "Future", exchange: "CBOT" },
  { id: "es", symbol: "ES", name: "E-mini S&P 500 future", kind: "Future", exchange: "CME" },
]

const COUPON_WORDS: Record<string, string> = { ".125": " 1/8", ".25": " 1/4", ".375": " 3/8", ".5": " 1/2", ".625": " 5/8", ".75": " 3/4", ".875": " 7/8" }
const couponWord = (coupon: number) => {
  const whole = Math.floor(coupon)
  const rest = String(coupon - whole).replace(/^0/, "")
  return `${whole}${COUPON_WORDS[rest] ?? ""}`
}

const search: InstrumentSearchFn = (query, hint, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      if (hint.kind === "cusip") return resolve(MASTER.filter((h) => h.cusip === hint.cusip))
      if (hint.kind === "isin") return resolve(MASTER.filter((h) => h.isin === hint.isin))
      if (hint.kind === "coupon-maturity" && hint.coupon !== undefined && hint.maturityParts) {
        const mm = String(hint.maturityParts.month).padStart(2, "0")
        const yy = String(hint.maturityParts.year).slice(-2)
        return resolve(MASTER.filter((h) => h.kind === "UST" && h.symbol === `T ${couponWord(hint.coupon!)} ${mm}/${yy}`))
      }
      const q = query.trim().toUpperCase()
      resolve(MASTER.filter((h) => h.symbol.toUpperCase().startsWith(q) || h.name?.toUpperCase().includes(q)))
    }, 300)
    signal.addEventListener("abort", () => {
      clearTimeout(t)
      reject(new Error("aborted"))
    })
  })

const symbols = toSymbolAdapter(search)

export function InstrumentSearchScene() {
  const actions = useMemo(() => createActionRegistry(), [])
  const [query, setQuery] = useState("")
  const [log, setLog] = useState<string[]>([])
  const say = (line: string) => setLog((l) => [line, ...l].slice(0, 6))
  const hint = recognizeQuery(query)
  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col gap-3 p-4 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">instrument-search</h1>
        <span className="text-muted-foreground">Type a ticker (zn, brk.b), a CUSIP (037833100), an ISIN (US0378331005), or a run's phrase (4 1/8 05/34, T 4 5/8 05/15/54). The same search answers the palette on mod+k.</span>
      </div>
      <InstrumentSearch search={search} query={query} onQueryChange={setQuery} onSelect={(hit, h) => say(`picked ${hit.symbol} (${hit.id}), read as ${QUERY_KIND_LABELS[h.kind]}`)} autoFocus clearOnSelect={false} />
      <div className="rounded-md border border-border bg-card p-2 text-muted-foreground" data-recognized={hint.kind}>
        <div className="font-medium text-foreground">recognizeQuery</div>
        <pre className="whitespace-pre-wrap">{JSON.stringify(hint, null, 1)}</pre>
      </div>
      <pre className="h-24 overflow-auto rounded-md border border-border bg-card p-2 text-muted-foreground">{log.join("\n") || "picks land here"}</pre>
      <CommandPalette actions={actions} symbols={symbols} onSymbolSelect={(s) => say(`palette picked ${s.symbol}`)} />
    </main>
  )
}
