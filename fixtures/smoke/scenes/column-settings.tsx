import type { ReactNode } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ColumnChooser, ColumnChooserFrozen, ColumnChooserHiddenCount, ColumnChooserItem, ColumnChooserMove, ColumnChooserName, ColumnChooserResetAll, ColumnChooserResetWidth, ColumnChooserRule, ColumnChooserSearch, ColumnChooserVisibility, ColumnChooserWidth, DEFAULT_COLUMN_CHOOSER_LABELS, useColumnChooser, type ColumnChooserProps } from "@/components/ui/column-chooser"
export function ColumnSettingsDialog<T>({ open, onOpenChange, className, children, ...props }: Omit<ColumnChooserProps<T>, "children"> & { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  const labels = { ...DEFAULT_COLUMN_CHOOSER_LABELS, ...props.labels }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
      <DialogContent className={`max-h-[calc(100%-2rem)] grid-cols-1 overflow-auto sm:max-w-lg ${className ?? ""}`}>
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
