import { useRef, useCallback, useState } from "react"
import type { ColumnRule } from "@/registry/tradecn/lib/grid-rules"
import { ColumnChooser, ColumnChooserAnnouncer, ColumnChooserFrozen, ColumnChooserHiddenCount, ColumnChooserItem, ColumnChooserMove, ColumnChooserName, ColumnChooserResetAll, ColumnChooserResetWidth, ColumnChooserRule, ColumnChooserSearch, ColumnChooserWidth, useColumnChooser, useColumnChooserCommand, useColumnChooserItem } from "@/registry/tradecn/ui/column-chooser"
import type { ColumnDef, ColumnState } from "@/registry/tradecn/ui/data-grid"

type Quote = { id: string; client: string; price: number }
const columns: ColumnDef<Quote>[] = [
  { key: "id", header: "RFQ", width: 80, frozen: "left", accessor: (row) => row.id },
  { key: "client", header: "Client", width: 112, accessor: (row) => row.client },
  { key: "price", header: "Price", width: 96, numeric: true, accessor: (row) => row.price },
]
const rules: ColumnRule[] = [{ id: "par", column: "price", when: { op: "gte", value: "100" }, tone: "up", label: "At or above par" }]
const descriptions: Record<string, string> = { id: "Request identifier", client: "Counterparty name", price: "Quoted price" }

const baseState: ColumnState = { order: [], widths: { price: 144 }, hidden: ["client"] }

export default function ColumnChooserInlineDemo() {
  const [columnState, setColumnState] = useState<ColumnState>(baseState)
  return <ColumnChooser baseState={baseState} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} rules={rules} className="w-xl max-w-full"><ColumnCards /></ColumnChooser>
}

function ColumnCards() {
  const { shown, labels } = useColumnChooser()
  return (
    <>
      <ColumnChooserAnnouncer />
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
            <ColumnChooserMove direction="up" aria-label={`Earlier: ${row.name}`}>Earlier</ColumnChooserMove>
            <ColumnChooserMove direction="down" aria-label={`Later: ${row.name}`}>Later</ColumnChooserMove>
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
  const el = useRef<HTMLInputElement>(null)
  const element = useCallback(() => el.current, [])
  // Declaring the command keeps Space live on the card while this checkbox stays out of the
  // Tab order; handing the element routes the key through the checkbox's own click, vetoes
  // and disabled states included.
  useColumnChooserCommand("visibility", true, element)
  return <input ref={el} type="checkbox" checked={row.visible} tabIndex={-1} aria-label={`${labels.show} ${row.name}`} className="size-4 shrink-0 accent-primary" onChange={(event) => setVisible(event.target.checked)} />
}
