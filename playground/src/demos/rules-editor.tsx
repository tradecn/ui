import { useState } from "react"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import type { ColumnDef } from "@/registry/tradecn/ui/data-grid"
import { RulesEditor, RulesEditorAdd, RulesEditorColumn, RulesEditorItem, RulesEditorOperator, RulesEditorProblem, RulesEditorRemove, RulesEditorTone, RulesEditorValue } from "@/registry/tradecn/ui/rules-editor"

interface Quote { px: number }
const columns: ColumnDef<Quote>[] = [
  { key: "px", header: "Price", width: 100, numeric: true, accessor: (row) => row.px },
]

export default function RulesEditorDemo() {
  const [rules, setRules] = useState<GridRules>({
    columns: [{ id: "price", column: "px", when: { op: "gte", value: "100" }, tone: "up" }],
  })
  return (
    <RulesEditor columns={columns} rules={rules} onRulesChange={setRules} className="w-lg max-w-full">
      <ul className="space-y-2">
        {rules.columns?.map((rule, index) => (
          <li key={rule.id}>
            <RulesEditorItem kind="highlights" index={index}>
              <RulesEditorColumn />
              <RulesEditorOperator />
              <RulesEditorValue />
              <RulesEditorValue field="low" />
              <RulesEditorValue field="high" />
              <RulesEditorValue field="values" />
              <RulesEditorTone />
              <RulesEditorRemove>Remove</RulesEditorRemove>
              <RulesEditorProblem />
            </RulesEditorItem>
          </li>
        ))}
      </ul>
      {!rules.columns?.length && <p className="text-muted-foreground">No highlights.</p>}
      <RulesEditorAdd kind="highlights">Add highlight</RulesEditorAdd>
    </RulesEditor>
  )
}
