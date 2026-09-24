import { useState } from "react"
import { compileComparator, compileFilter, type RuleColumn } from "@/registry/tradecn/lib/grid-rules"

interface Request {
  id: string
  size: number
  status: string
}

const columns: RuleColumn<Request>[] = [
  { key: "size", header: "Size", numeric: true, accessor: (row) => row.size },
  { key: "status", header: "Status", accessor: (row) => row.status },
]
const matches = compileFilter([{ column: "size", op: "gte", value: "2,000,000" }], columns)
const compare = compileComparator([{ key: "status", dir: "asc" }, { key: "size", dir: "desc" }], columns)
const requests: Request[] = [
  { id: "Q-1", size: 5_000_000, status: "Open" },
  { id: "Q-2", size: 10_000_000, status: "Quoted" },
  { id: "Q-3", size: 1_000_000, status: "Open" },
  { id: "Q-4", size: 15_000_000, status: "Open" },
  { id: "Q-5", size: 2_000_000, status: "Done away" },
]

export default function GridRulesFilterSortDemo() {
  const [filtered, setFiltered] = useState(true)
  const [sorted, setSorted] = useState(true)
  const rows = filtered ? requests.filter(matches) : [...requests]
  if (sorted && compare) rows.sort(compare)

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-3 text-xs lining-nums tabular-nums">
        <label className="flex items-center gap-1"><input type="checkbox" checked={filtered} onChange={(event) => setFiltered(event.target.checked)} />Minimum size: 2,000,000</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={sorted} onChange={(event) => setSorted(event.target.checked)} />Sort by status, then size</label>
      </div>
      <div className="w-96 max-w-full space-y-3 text-xs lining-nums tabular-nums">
        <table className="w-full text-left">
          <thead className="text-muted-foreground">
            <tr><th scope="col" className="px-2 py-1 font-medium">Request</th><th scope="col" className="px-2 py-1 text-right font-medium">Size</th><th scope="col" className="px-2 py-1 font-medium">Status</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <th scope="row" className="px-2 py-1 font-normal">{row.id}</th><td className="px-2 py-1 text-right">{row.size.toLocaleString("en-US")}</td><td className="px-2 py-1">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p role="status" className="text-muted-foreground">Showing {rows.length} of {requests.length} requests. {sorted ? "Order: status, then largest size." : "Source order."}</p>
      </div>
    </>
  )
}
