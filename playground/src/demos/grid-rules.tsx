import { useMemo, useState } from "react"
import { createInstrumentFormatter, formatNotional } from "@/registry/tradecn/lib/format"
import { describeRule, type GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef } from "@/registry/tradecn/ui/data-grid"

interface Rfq {
  id: string
  client: string
  size: number
  px: number | null
  status: string
}

const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })

// The price column reads a typed value in its own notation through `parse`, so a rule says "100-00".
const columns: ColumnDef<Rfq>[] = [
  { key: "id", header: "RFQ", width: 72, frozen: "left", accessor: (r) => r.id },
  { key: "client", header: "Client", width: 96, sortable: true, accessor: (r) => r.client },
  { key: "size", header: "Size", width: 80, numeric: true, sortable: true, accessor: (r) => r.size, format: (v) => formatNotional(v as number, { unit: "mm" }) },
  { key: "px", header: "Price", width: 88, numeric: true, font: "mono", sortable: true, accessor: (r) => r.px, format: (v) => ust.price(v as number | null), parse: ust.parsePrice },
  { key: "status", header: "Status", width: 96, sortable: true, accessor: (r) => r.status },
]

// What a desk writes: JSON, no build. A value is typed the way the column prints it, and a tone is a token.
const RULES: GridRules = {
  columns: [
    { id: "rich", column: "px", when: { op: "gte", value: "100-00" }, tone: "up", label: "Rich to the market" },
    { id: "cheap", column: "px", when: { op: "lt", value: "99-16" }, tone: "down", label: "Cheap to the market" },
    { id: "large", column: "size", when: { op: "gte", value: "10,000,000" }, tone: "primary", target: "row", label: "Large" },
    { id: "gone", column: "status", when: { op: "eq", value: "Done away" }, tone: "stale", target: "row" },
  ],
  filter: [{ column: "size", op: "gte", value: "2,000,000" }],
  sort: [
    { key: "status", dir: "asc" },
    { key: "size", dir: "desc" },
  ],
}

const ROWS: Rfq[] = [
  { id: "Q-1", client: "ALPHA", size: 5_000_000, px: 99.5, status: "Open" },
  { id: "Q-2", client: "BETA", size: 25_000_000, px: 100.015625, status: "Open" },
  { id: "Q-3", client: "GAMMA", size: 1_000_000, px: 99.75, status: "Open" },
  { id: "Q-4", client: "DELTA", size: 10_000_000, px: 99.25, status: "Quoted" },
  { id: "Q-5", client: "EPSILON", size: 2_000_000, px: null, status: "Open" },
  { id: "Q-6", client: "ZETA", size: 15_000_000, px: 100.5, status: "Done away" },
  { id: "Q-7", client: "THETA", size: 3_000_000, px: 99.484375, status: "Quoted" },
]

export default function GridRulesDemo() {
  const store = useMemo(() => {
    const s = createRowStore<Rfq>({ getRowId: (r) => r.id })
    s.applyDeltas({ upsert: ROWS })
    return s
  }, [])
  const [on, setOn] = useState({ columns: true, filter: true, sort: true })
  // A new object only when a part is switched: the grid remakes its view on the object's identity.
  const rules = useMemo<GridRules>(() => ({ columns: on.columns ? RULES.columns : undefined, filter: on.filter ? RULES.filter : undefined, sort: on.sort ? RULES.sort : undefined }), [on])
  return (
    <div className="w-full grid gap-3 font-(family-name:--tradecn-font-mono) text-xs sm:grid-cols-[1fr_14rem]">
      <div className="flex h-64 flex-col gap-2">
        <div className="flex gap-3 text-muted-foreground">
          {(["columns", "filter", "sort"] as const).map((part) => (
            <label key={part} className="flex items-center gap-1">
              <input type="checkbox" checked={on[part]} onChange={(e) => setOn({ ...on, [part]: e.target.checked })} />
              {part}
            </label>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          <DataGrid store={store} columns={columns} preset="rfq" label="Open RFQs" rules={rules} />
        </div>
      </div>
      <ul className="space-y-1 text-muted-foreground">
        {RULES.columns!.map((rule) => (
          <li key={rule.id}>
            <span className="text-foreground">{rule.label ?? describeRule(rule, columns)}</span>: {describeRule(rule, columns)}, {rule.target ?? "cell"} in {rule.tone}
          </li>
        ))}
        <li>show {describeRule(RULES.filter![0]!, columns)}</li>
        <li>order by {RULES.sort!.map((s) => `${s.key} ${s.dir}`).join(", then ")}</li>
      </ul>
    </div>
  )
}
