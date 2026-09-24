import { applyRules, describeRule, type ColumnRule, type RuleColumn } from "@/registry/tradecn/lib/grid-rules"

interface Request {
  id: string
  size: number
}

const columns: RuleColumn<Request>[] = [{ key: "size", header: "Size", numeric: true, accessor: (row) => row.size }]
const rule: ColumnRule = { id: "large", column: "size", when: { op: "gte", value: "10,000,000" }, tone: "primary" }
const applied = applyRules([rule], columns)
const rows: Request[] = [{ id: "Q-1", size: 5_000_000 }, { id: "Q-2", size: 10_000_000 }]

export default function GridRulesDemo() {
  return (
    <div className="w-fit max-w-full space-y-3 text-xs lining-nums tabular-nums">
      <p>{describeRule(rule, columns)}</p>
      <table className="text-left">
        <thead className="text-muted-foreground">
          <tr><th scope="col" className="px-2 py-1 font-medium">Request</th><th scope="col" className="px-2 py-1 text-right font-medium">Size</th><th scope="col" className="px-2 py-1 font-medium">Rule</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const decoration = applied.cell("size", row)
            return (
              <tr key={row.id} className="border-t border-border">
                <th scope="row" className="px-2 py-1 font-normal">{row.id}</th>
                <td {...decoration} className={`px-2 py-1 text-right ${decoration?.className ?? ""}`}>{row.size.toLocaleString("en-US")}</td>
                <td className="px-2 py-1">{decoration ? "Matched" : "No match"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
