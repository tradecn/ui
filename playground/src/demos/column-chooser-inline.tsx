import { useState } from "react"
import type { ColumnRule } from "@/registry/tradecn/lib/grid-rules"
import { ColumnChooser, ColumnChooserFrozen, ColumnChooserHiddenCount, ColumnChooserItem, ColumnChooserMove, ColumnChooserName, ColumnChooserResetAll, ColumnChooserResetWidth, ColumnChooserRule, ColumnChooserSearch, ColumnChooserWidth, useColumnChooser, useColumnChooserItem } from "@/registry/tradecn/ui/column-chooser"
import type { ColumnDef, ColumnState } from "@/registry/tradecn/ui/data-grid"

type Quote = { id: string; client: string; price: number }
const columns: ColumnDef<Quote>[] = [
  { key: "id", header: "RFQ", width: 80, frozen: "left", accessor: (row) => row.id },
  { key: "client", header: "Client", width: 112, accessor: (row) => row.client },
  { key: "price", header: "Price", width: 96, numeric: true, accessor: (row) => row.price },
]
const rules: ColumnRule[] = [{ id: "par", column: "price", when: { op: "gte", value: "100" }, tone: "up", label: "At or above par" }]
const descriptions: Record<string, string> = { id: "Request identifier", client: "Counterparty name", price: "Quoted price" }

export default function ColumnChooserInlineDemo() {
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: { price: 144 }, hidden: ["client"] })
  return <ColumnChooser columns={columns} columnState={columnState} onColumnStateChange={setColumnState} rules={rules} className="w-xl max-w-full"><ColumnCards /></ColumnChooser>
}

function ColumnCards() {
  const { shown, labels } = useColumnChooser()
  return (
    <>
      <ColumnChooserSearch className="max-w-none" />
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((row) => <ColumnChooserItem key={row.key} columnKey={row.key} className="flex-col items-stretch border-border p-3">
          <div className="flex items-center gap-2"><ColumnChooserName /><ColumnChooserFrozen /><ColumnCardVisibility /></div>
          <p className="text-muted-foreground">{descriptions[row.key]}</p>
          <div className="flex flex-wrap items-center gap-2">
            <ColumnChooserWidth className="w-auto text-left" />
            {row.rules.map(({ rule }, index) => <ColumnChooserRule key={`${rule.id}-${index}`} ruleIndex={index} />)}
          </div>
          <div className="flex flex-wrap gap-2">
            <ColumnChooserMove direction="up">Earlier</ColumnChooserMove>
            <ColumnChooserMove direction="down">Later</ColumnChooserMove>
            <ColumnChooserResetWidth>{labels.resetWidth}</ColumnChooserResetWidth>
          </div>
        </ColumnChooserItem>)}
      </div>
      {!shown.length && <p className="text-muted-foreground">{labels.empty}</p>}
      <div className="flex items-center gap-2"><ColumnChooserHiddenCount /><ColumnChooserResetAll className="ml-auto">{labels.resetAll}</ColumnChooserResetAll></div>
      <p className="text-muted-foreground">{labels.dragHint}</p>
    </>
  )
}

function ColumnCardVisibility() {
  const { row, setVisible } = useColumnChooserItem()
  const { labels } = useColumnChooser()
  return <input type="checkbox" checked={row.visible} aria-label={`${labels.show} ${row.name}`} className="size-4 shrink-0 accent-primary" onChange={(event) => setVisible(event.target.checked)} />
}
