import { useState, type ComponentProps, type ReactNode } from "react"
import { createInstrumentFormatter, formatNotional } from "@/registry/tradecn/lib/format"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ColumnChooser, ColumnChooserAnnouncer, ColumnChooserFrozen, ColumnChooserHiddenCount, ColumnChooserItem, ColumnChooserMove, ColumnChooserName, ColumnChooserResetAll, ColumnChooserResetWidth, ColumnChooserRule, ColumnChooserSearch, ColumnChooserVisibility, ColumnChooserWidth, DEFAULT_COLUMN_CHOOSER_LABELS, useColumnChooser, type ColumnChooserProps } from "@/registry/tradecn/ui/column-chooser"
import { DataGrid, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"

type Quote = { id: string; client: string; size: number; price: number }
const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })
const columns: ColumnDef<Quote>[] = [
  { key: "client", header: "Client", width: 112, accessor: (row) => row.client },
  { key: "size", header: "Size", width: 96, numeric: true, accessor: (row) => row.size, format: (value) => formatNotional(value as number, { unit: "mm" }) },
  { key: "price", header: "Price", width: 96, numeric: true, font: "mono", accessor: (row) => row.price, format: (value) => ust.price(value as number), parse: ust.parsePrice },
]

export default function ColumnChooserDemo() {
  const [store] = useState(() => {
    const rows = createRowStore<Quote>({ getRowId: (row) => row.id })
    rows.applyDeltas({ upsert: [
      { id: "Q-1", client: "ALPHA", size: 5_000_000, price: 99.5 },
      { id: "Q-2", client: "BETA", size: 10_000_000, price: 99.515625 },
    ] })
    return rows
  })
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
  const [open, setOpen] = useState(false)

  return (
    <ColumnSettingsDialog open={open} onOpenChange={setOpen} columns={columns} columnState={columnState} onColumnStateChange={setColumnState}>
      <div data-demo-controls className="text-xs">
        <DialogTrigger className="rounded border border-border px-2 py-1">Columns</DialogTrigger>
      </div>
      <div className="flex min-h-104 w-fit max-w-full flex-col justify-center">
        <div className="h-40">
          <DataGrid store={store} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} label="Quotes" />
        </div>
      </div>
    </ColumnSettingsDialog>
  )
}

export function ColumnSettingsDialog<T>({ open, onOpenChange, className, contentProps, children, ...props }: Omit<ColumnChooserProps<T>, "children"> & { open: boolean; onOpenChange: (open: boolean) => void; contentProps?: Omit<ComponentProps<typeof DialogContent>, "children">; children: ReactNode }) {
  const labels = { ...DEFAULT_COLUMN_CHOOSER_LABELS, ...props.labels }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
      <DialogContent {...contentProps} className={contentProps?.className ?? `max-h-[calc(100%-2rem)] grid-cols-1 overflow-auto sm:max-w-lg ${className ?? ""}`}>
        <DialogHeader><DialogTitle>{labels.title}</DialogTitle><DialogDescription>{labels.description}</DialogDescription></DialogHeader>
        <ColumnSettingsPanel {...props} />
      </DialogContent>
    </Dialog>
  )
}

export function ColumnSettingsPanel<T>(props: Omit<ColumnChooserProps<T>, "children">) {
  return <ColumnChooser {...props}><ColumnSettings /></ColumnChooser>
}

export function ColumnSettings() {
  const { shown, labels } = useColumnChooser()
  return (
    <>
      <ColumnChooserAnnouncer />
      <div className="flex flex-wrap items-center gap-2">
        <ColumnChooserSearch />
        <ColumnChooserHiddenCount />
        <ColumnChooserResetAll className="ml-auto">{labels.resetAll}</ColumnChooserResetAll>
      </div>
      {shown.length ? (
        <div className="overflow-x-auto">
          <ul className="flex min-w-0 flex-col gap-0.5" aria-label={labels.title}>
            {shown.map((row) => <li key={row.key}>
              <ColumnChooserItem columnKey={row.key} className="flex-wrap">
                <span className="flex min-w-52 flex-1 items-center gap-2">
                  <span aria-hidden className="cursor-grab select-none text-muted-foreground" title={labels.dragHint}>
                    <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                      <circle cx="2" cy="2" r="1.2" /><circle cx="6" cy="2" r="1.2" />
                      <circle cx="2" cy="6" r="1.2" /><circle cx="6" cy="6" r="1.2" />
                      <circle cx="2" cy="10" r="1.2" /><circle cx="6" cy="10" r="1.2" />
                    </svg>
                  </span>
                  <ColumnChooserVisibility />
                  <ColumnChooserName />
                  <ColumnChooserFrozen />
                </span>
                {row.rules.map(({ rule }, index) => <ColumnChooserRule key={`${rule.id}-${index}`} ruleIndex={index} />)}
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <ColumnChooserWidth />
                  <ColumnChooserResetWidth>{labels.resetWidth}</ColumnChooserResetWidth>
                  <span className="flex shrink-0 items-center">
                    <ColumnChooserMove direction="up" className="w-6 px-0"><span aria-hidden>▲</span></ColumnChooserMove>
                    <ColumnChooserMove direction="down" className="w-6 px-0"><span aria-hidden>▼</span></ColumnChooserMove>
                  </span>
                </span>
              </ColumnChooserItem>
            </li>)}
          </ul>
        </div>
      ) : <p className="text-muted-foreground">{labels.empty}</p>}
      <p className="text-muted-foreground">{labels.dragHint}</p>
    </>
  )
}
