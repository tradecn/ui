import { useState } from "react"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { ColumnChooser, ColumnChooserAnnouncer, ColumnChooserItem, ColumnChooserName, ColumnChooserResetAll, ColumnChooserVisibility, useColumnChooser } from "@/registry/tradecn/ui/column-chooser"
import { DataGrid, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"

type Quote = { id: string; price: number; size: number }
const columns: ColumnDef<Quote>[] = [
  { key: "id", header: "Quote", width: 96, frozen: "left", accessor: row => row.id },
  { key: "price", header: "Price", width: 100, numeric: true, accessor: row => row.price, format: value => Number(value).toFixed(2) },
  { key: "size", header: "Size", width: 90, numeric: true, accessor: row => row.size },
]
const baseState: ColumnState = { order: ["id", "size", "price"], widths: { price: 144 }, hidden: ["size"] }

export default function DataGridSharedDefaultsDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Quote>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [
      { id: "Q-1", price: 100.25, size: 500 },
      { id: "Q-2", price: 99.75, size: 250 },
    ] })
    return store
  })
  const [columnState, setColumnState] = useState(baseState)
  const settings = { columns, columnState, onColumnStateChange: setColumnState, baseState }
  return (
    <div className="flex w-fit max-w-full flex-wrap items-start gap-4">
      {/* No reset-width control here, so the hint must not promise Delete. */}
      <ColumnChooser {...settings} labels={{ dragHint: "Up and Down move between columns, and Home and End jump to the ends. Drag a column, or hold Alt with an arrow key, to reorder; Alt+Home and Alt+End move to the edge. Space shows or hides a focused column. Frozen columns stay first." }} className="w-44 max-w-full shrink-0">
        <p className="font-medium">Visible columns</p>
        <ColumnChooserAnnouncer />
        <VisibleColumns />
        <ColumnChooserResetAll>Restore columns</ColumnChooserResetAll>
      </ColumnChooser>
      <div className="h-48 min-w-0 max-w-full">
        <DataGrid {...settings} store={store} label="Quotes with shared defaults" />
      </div>
    </div>
  )
}

function VisibleColumns() {
  const { rows, labels } = useColumnChooser()
  return (
    <>
      <p className="text-xs text-muted-foreground">{labels.dragHint}</p>
      <ul className="flex flex-col gap-1" aria-label="Visible columns">
      {rows.map(row => <li key={row.key}>
        <ColumnChooserItem columnKey={row.key}>
          <ColumnChooserVisibility />
          <ColumnChooserName />
        </ColumnChooserItem>
      </li>)}
      </ul>
    </>
  )
}
