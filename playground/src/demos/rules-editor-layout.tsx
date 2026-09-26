import { useState } from "react"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import type { ColumnDef } from "@/registry/tradecn/ui/data-grid"
import { RulesEditor, RulesEditorAdd, RulesEditorColumn, RulesEditorDirection, RulesEditorFilterCount, RulesEditorItem, RulesEditorMatchCount, RulesEditorMove, RulesEditorOperator, RulesEditorProblem, RulesEditorRemove, RulesEditorValue } from "@/registry/tradecn/ui/rules-editor"

interface Order { id: string; account: string; size: number }
const columns: ColumnDef<Order>[] = [
  { key: "account", header: "Account", width: 120, accessor: (row) => row.account },
  { key: "size", header: "Size", width: 100, numeric: true, accessor: (row) => row.size },
]

export default function RulesEditorLayoutDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Order>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: [{ id: "a", account: "ALPHA", size: 500 }, { id: "b", account: "BETA", size: 200 }] })
    return store
  })
  const [rules, setRules] = useState<GridRules>({
    filter: [{ column: "size", op: "gte", value: "300" }],
    sort: [{ key: "size", dir: "desc" }, { key: "account", dir: "asc" }],
  })
  return (
    <RulesEditor columns={columns} rules={rules} onRulesChange={setRules} store={store} className="w-2xl max-w-full gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Order priority</h2>
        <RulesEditorFilterCount />
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="min-w-0 space-y-2" aria-label="Include orders">
          <h3 className="font-medium">Include orders</h3>
          <p className="text-muted-foreground">Conditions apply to all accounts.</p>
          {!rules.filter?.length && <p>Every order is included.</p>}
          {rules.filter?.map((_, index) => (
            <RulesEditorItem kind="filters" index={index} key={index} className="flex-col items-stretch gap-2 p-3">
              <header className="flex flex-wrap items-center justify-between gap-1">
                <RulesEditorColumn />
                <RulesEditorRemove>Remove</RulesEditorRemove>
              </header>
              <div className="flex flex-wrap items-center gap-2">
                <RulesEditorOperator />
                <RulesEditorValue />
                <RulesEditorValue field="low" />
                <RulesEditorValue field="high" />
                <RulesEditorValue field="values" />
              </div>
              <RulesEditorProblem />
              <footer className="flex flex-wrap items-center gap-1">
                <RulesEditorMatchCount />
                <RulesEditorMove direction="up">Earlier</RulesEditorMove>
                <RulesEditorMove direction="down">Later</RulesEditorMove>
              </footer>
            </RulesEditorItem>
          ))}
          <RulesEditorAdd kind="filters">Add condition</RulesEditorAdd>
        </section>
        <section className="min-w-0 space-y-2" aria-label="Priority">
          <h3 className="font-medium">Priority</h3>
          <p className="text-muted-foreground">Earlier keys take precedence.</p>
          {!rules.sort?.length && <p>Keep arrival order.</p>}
          {rules.sort?.map((_, index) => (
            <RulesEditorItem kind="sort" index={index} key={index} className="flex-col items-stretch gap-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <RulesEditorDirection />
                <RulesEditorColumn />
              </div>
              <RulesEditorProblem />
              <footer className="flex flex-wrap items-center gap-1">
                <RulesEditorMove direction="up">Earlier</RulesEditorMove>
                <RulesEditorMove direction="down">Later</RulesEditorMove>
                <RulesEditorRemove className="ml-auto">Remove</RulesEditorRemove>
              </footer>
            </RulesEditorItem>
          ))}
          <RulesEditorAdd kind="sort">Add priority</RulesEditorAdd>
        </section>
      </div>
      <p className="text-muted-foreground">Drag a card or use Alt+Up/Down to reorder.</p>
    </RulesEditor>
  )
}
