import { useState } from "react"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { formatNotional } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef } from "@/registry/tradecn/ui/data-grid"

interface Inquiry { id: string; client: string; size: number }

const columns: ColumnDef<Inquiry>[] = [
  { key: "client", header: "Client", width: 160, accessor: (row) => row.client },
  { key: "size", header: "Size", width: 120, numeric: true, accessor: (row) => row.size, format: (value) => formatNotional(value as number, { unit: "mm" }) },
]

export default function DataGridSelectionDemo() {
  const [store] = useState(() => {
    const store = createRowStore<Inquiry>({ getRowId: (row) => row.id })
    store.applyDeltas({ upsert: [
      { id: "Q-1", client: "ALPHA", size: 5_000_000 },
      { id: "Q-2", client: "BETA", size: 10_000_000 },
      { id: "Q-3", client: "GAMMA", size: 15_000_000 },
    ] })
    return store
  })
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  const [action, setAction] = useState("No action yet.")
  return (
    <div className="w-fit max-w-full space-y-2 text-xs lining-nums tabular-nums">
      <div className="h-48">
        <DataGrid
          store={store} columns={columns} preset="rfq" label="Select inquiries"
          selectionMode="multi" selectionColumn selection={selection} onSelectionChange={setSelection}
          onRowActivate={(row) => setAction(`Open ticket: ${row.client}`)}
          renderContextMenu={(rows) => (
            <>
              <ContextMenuItem onClick={() => setAction(`Quote: ${rows.map((row) => row.client).join(", ")}`)}>Quote inquiries</ContextMenuItem>
              <ContextMenuItem onClick={() => setAction(`Pass: ${rows.map((row) => row.client).join(", ")}`)}>Pass inquiries</ContextMenuItem>
            </>
          )}
        />
      </div>
      <p>{selection.size} selected</p>
      <p role="status">{action}</p>
    </div>
  )
}
