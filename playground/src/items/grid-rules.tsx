import { useEffect, useMemo, useState } from "react"
import { createInstrumentFormatter, formatNotional } from "@/registry/tradecn/lib/format"
import { RULE_TONES, RULE_TONE_CLASS, describeRule, type GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createFrameBatcher, createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef, type SortState } from "@/registry/tradecn/ui/data-grid"

// A grid under a set of rules written as data, with each part switchable, the rules said in words
// beside it, every tone on show, and prices that move so a highlight comes and goes.

interface Rfq {
  id: string
  client: string
  instrument: string
  size: number
  px: number | null
  status: string
}

const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const CLIENTS = ["ALPHA", "BETA", "GAMMA", "DELTA", "EPSILON", "ZETA", "THETA", "KAPPA"]
const INSTRUMENTS = ["UST 2Y", "UST 5Y", "UST 10Y", "UST 30Y"]
const STATUSES = ["Open", "Open", "Open", "Quoted", "Done away"]

const columns: ColumnDef<Rfq>[] = [
  { key: "id", header: "RFQ", width: 80, frozen: "left", sortable: true, accessor: (r) => r.id },
  { key: "client", header: "Client", width: 96, sortable: true, accessor: (r) => r.client },
  { key: "instrument", header: "Instrument", width: 96, sortable: true, accessor: (r) => r.instrument },
  { key: "size", header: "Size", width: 80, numeric: true, sortable: true, accessor: (r) => r.size, format: (v) => formatNotional(v as number, { unit: "mm" }) },
  { key: "px", header: "Price", width: 88, numeric: true, font: "mono", sortable: true, accessor: (r) => r.px, format: (v) => ust.price(v as number | null), parse: ust.parsePrice },
  { key: "status", header: "Status", width: 96, sortable: true, accessor: (r) => r.status },
]

const RULES: GridRules = {
  columns: [
    { id: "rich", column: "px", when: { op: "gte", value: "100-00" }, tone: "up", label: "Rich to the market" },
    { id: "cheap", column: "px", when: { op: "lt", value: "99-16" }, tone: "down", label: "Cheap to the market" },
    { id: "no-price", column: "px", when: { op: "isNull" }, tone: "expiring", label: "No price yet" },
    { id: "large", column: "size", when: { op: "gte", value: "20,000,000" }, tone: "primary", target: "row", label: "Large" },
    { id: "gone", column: "status", when: { op: "eq", value: "Done away" }, tone: "stale", target: "row" },
  ],
  filter: [{ column: "size", op: "gte", value: "2,000,000" }],
  sort: [
    { key: "status", dir: "asc" },
    { key: "size", dir: "desc" },
  ],
}

function usePublisher() {
  const store = useMemo(() => createRowStore<Rfq>({ getRowId: (r) => r.id, lane: "ordered" }), [])
  useEffect(() => {
    const rows: Rfq[] = Array.from({ length: 40 }, (_, i) => ({
      id: `Q-${i + 1}`,
      client: CLIENTS[i % CLIENTS.length]!,
      instrument: INSTRUMENTS[i % INSTRUMENTS.length]!,
      size: (1 + (i % 9)) * 3_000_000,
      px: i % 11 === 0 ? null : 99 + Math.round(Math.random() * 96) / 64,
      status: STATUSES[i % STATUSES.length]!,
    }))
    store.applyDeltas({ upsert: rows })
    const batcher = createFrameBatcher<Rfq>(store.applyDeltas, { getRowId: (r) => r.id })
    const timer = setInterval(() => {
      const ids = store.getIds()
      for (let i = 0; i < 4; i++) {
        const id = ids[Math.floor(Math.random() * ids.length)]!
        const r = store.getRow(id)!
        if (r.px === null) continue
        batcher.push({ patch: [{ id, fields: { px: ust.step(r.px, Math.round((Math.random() - 0.5) * 6)) } }] })
      }
    }, 400)
    return () => {
      clearInterval(timer)
      batcher.cancel()
    }
  }, [store])
  return store
}

export function GridRulesScene() {
  const store = usePublisher()
  const [on, setOn] = useState({ columns: true, filter: true, sort: true })
  const [sort, setSort] = useState<SortState>(null)
  const rules = useMemo<GridRules>(() => ({ columns: on.columns ? RULES.columns : undefined, filter: on.filter ? RULES.filter : undefined, sort: on.sort ? RULES.sort : undefined }), [on])
  return (
    <main className="flex h-screen flex-col gap-3 p-4 font-(family-name:--tradecn-font-mono) text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">grid-rules</h1>
        <span className="text-muted-foreground">Rules as data over the grid. Prices move every 400 ms, so the highlights come and go. Click a header: your sort comes first and the rules break its ties.</span>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
        {(["columns", "filter", "sort"] as const).map((part) => (
          <label key={part} className="flex items-center gap-1">
            <input type="checkbox" checked={on[part]} onChange={(e) => setOn({ ...on, [part]: e.target.checked })} />
            rules.{part}
          </label>
        ))}
        <button type="button" className="rounded border border-border px-2" onClick={() => setSort(null)} disabled={!sort}>
          clear header sort
        </button>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_18rem]">
        <div className="min-h-0">
          <DataGrid store={store} columns={columns} preset="rfq" label="Open RFQs" rules={rules} sort={sort} onSortChange={setSort} />
        </div>
        <aside className="space-y-3 text-muted-foreground">
          <section>
            <h2 className="mb-1 font-semibold text-foreground">rules.columns</h2>
            <ul className="space-y-1">
              {RULES.columns!.map((rule) => (
                <li key={rule.id} data-rule-word={rule.id}>
                  <span className={`rounded-sm px-1 ${RULE_TONE_CLASS[rule.tone]}`}>{rule.label ?? describeRule(rule, columns)}</span> {describeRule(rule, columns)}, on the {rule.target ?? "cell"}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-1 font-semibold text-foreground">rules.filter</h2>
            <p>{describeRule(RULES.filter![0]!, columns)}</p>
          </section>
          <section>
            <h2 className="mb-1 font-semibold text-foreground">rules.sort</h2>
            <p>{RULES.sort!.map((s) => `${s.key} ${s.dir}`).join(", then ")}</p>
          </section>
          <section>
            <h2 className="mb-1 font-semibold text-foreground">every tone</h2>
            <ul className="flex flex-wrap gap-1">
              {RULE_TONES.map((tone) => (
                <li key={tone} className={`rounded-sm px-1.5 py-0.5 ${RULE_TONE_CLASS[tone]}`} data-tone={tone}>
                  {tone}
                </li>
              ))}
            </ul>
          </section>
          <pre className="max-h-64 overflow-auto rounded-md border border-border bg-card p-2 text-xs text-foreground">{JSON.stringify(RULES, null, 2)}</pre>
        </aside>
      </div>
    </main>
  )
}
