import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"
import { useMemo, useState } from "react"
import { PanelPopout } from "@/components/ui/panel"
import { usePopout } from "@/hooks/use-popout"
import { DialogTrigger } from "@/components/ui/dialog"
import { ColumnSettingsDialog, ColumnSettingsPanel } from "./column-settings"
import { DataGrid, type ColumnDef, type ColumnState } from "@/components/ui/data-grid"
import type { ColumnRule } from "@/lib/grid-rules"
import { createRowStore } from "@/lib/row-store"

interface Rfq {
  id: string
  client: string
  px: number
  size: number
  status: string
}

const columns: ColumnDef<Rfq>[] = [
  { key: "id", header: "RFQ", width: 72, frozen: "left", accessor: (r) => r.id },
  { key: "client", header: "Client", width: 90, accessor: (r) => r.client },
  { key: "px", header: "Price", width: 80, numeric: true, accessor: (r) => r.px },
  { key: "size", header: "Size", width: 80, numeric: true, accessor: (r) => r.size },
  { key: "status", header: "Status", width: 90, accessor: (r) => r.status },
]

const RULES: ColumnRule[] = [{ id: "rich", column: "px", when: { op: "gte", value: "100" }, tone: "up", label: "Rich to the market" }]

// The panel inline is the scene's item; the dialog opens from the button for its own test.
export function ColumnChooserScene() {
  const store = useMemo(() => {
    const s = createRowStore<Rfq>({ getRowId: (r) => r.id })
    s.applyDeltas({
      upsert: [
        { id: "a", client: "ALPHA", px: 99.5, size: 5_000_000, status: "Open" },
        { id: "b", client: "BETA", px: 100.25, size: 25_000_000, status: "Quoted" },
      ],
    })
    return s
  }, [])
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: { px: 120 }, hidden: [] })
  const [open, setOpen] = useState(false)
  const popout = usePopout({ title: "Column settings", width: 720, height: 520 })
  return (
    <ColumnSettingsDialog open={open} onOpenChange={setOpen} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} rules={RULES}>
      <div className="flex w-[52rem] flex-col gap-2" data-chooser-state={JSON.stringify(columnState)}>
        <div style={{ height: 120 }}>
          <DataGrid store={store} columns={columns} label="Chosen" columnState={columnState} onColumnStateChange={setColumnState} rules={{ columns: RULES }} />
        </div>
        <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}>
          open chooser
        </DialogTrigger>
        <button type="button" className="self-start" onClick={() => popout.open()}>pop out chooser</button>
        <PanelPopout popout={popout}>
          {popout.isOpen && <button type="button" onClick={popout.close}>bring chooser back</button>}
          <ColumnSettingsPanel columns={columns} columnState={columnState} onColumnStateChange={setColumnState} rules={RULES} />
        </PanelPopout>
      </div>
    </ColumnSettingsDialog>
  )
}
