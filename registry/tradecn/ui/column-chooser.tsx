import { cn } from "cn"
import { useMemo, useState, type DragEvent, type KeyboardEvent } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NUMERIC_CLASS } from "@/registry/tradecn/lib/format"
import { RULE_TONE_CLASS, columnName, describeRule, type ColumnRule } from "@/registry/tradecn/lib/grid-rules"
import { EMPTY_COLUMN_STATE, type ColumnDef, type ColumnState } from "@/registry/tradecn/ui/data-grid"

// The surface over one grid's columns: every column with show and hide, reorder by drag or by
// keyboard, a width reset where a column was resized, a search box, frozen columns marked, and
// reset all. It reads and writes the grid's own `ColumnState` through `columnState` and
// `onColumnStateChange` and stores nothing, so what it shows is what the grid shows, and where the
// state is kept (a panel's state, a preferences envelope) stays the consumer's. A rule that names a
// column is said in words beside it, so a highlight can be read without the color.
//
// `ColumnChooser` is the dialog, a hotkey wall like any dialog: with focus inside it only its own
// scopes run, so a grid's single-key bindings do not fire while a column is being found by typing.
// `ColumnChooserPanel` is the same list inline, for a sheet, a tab, or a settings page.

export interface ColumnChooserLabels {
  title: string
  description: string
  search: string
  /** Prefix of a checkbox's name: "Show Price". */
  show: string
  frozen: string
  /** After a count: "2 hidden". */
  hidden: string
  width: string
  resetWidth: string
  moveUp: string
  moveDown: string
  resetAll: string
  empty: string
  dragHint: string
}

export const DEFAULT_COLUMN_CHOOSER_LABELS: ColumnChooserLabels = {
  title: "Columns",
  description: "Show, hide, reorder, and size the columns of this grid.",
  search: "Find a column",
  show: "Show",
  frozen: "frozen",
  hidden: "hidden",
  width: "Width",
  resetWidth: "Reset width",
  moveUp: "Move up",
  moveDown: "Move down",
  resetAll: "Reset all",
  empty: "No column matches.",
  dragHint: "Drag a column, or hold Alt with an arrow key, to reorder. Frozen columns stay first.",
}

export interface ColumnChooserPanelProps<T> {
  columns: ColumnDef<T>[]
  columnState: ColumnState
  onColumnStateChange: (state: ColumnState) => void
  /** Rules that name columns, said in words beside the columns they touch. */
  rules?: ColumnRule[]
  labels?: Partial<ColumnChooserLabels>
  className?: string
}

export interface ColumnChooserProps<T> extends ColumnChooserPanelProps<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** One column as the chooser lists it. */
export interface ChooserRow<T> {
  column: ColumnDef<T>
  key: string
  name: string
  visible: boolean
  frozen: boolean
  /** The width in force: the state's, else the column's own. */
  width: number
  /** The state holds a width for it. */
  resized: boolean
  rules: ColumnRule[]
}

/**
 * The columns in the order the grid shows them, frozen ones first, hidden ones in their place, with
 * the width in force and the rules that name each. A column hidden in its definition is not listed:
 * that is a decision in code, not one for this surface.
 */
export function chooserRows<T>(columns: ColumnDef<T>[], state: ColumnState, rules: readonly ColumnRule[] = []): ChooserRow<T>[] {
  const rank = new Map(state.order.map((key, index) => [key, index]))
  const hidden = new Set(state.hidden)
  const ordered = columns
    .filter((column) => !column.hidden)
    .map((column, index) => ({ column, rank: rank.get(column.key) ?? 1e6 + index }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ column }) => column)
  const frozen = ordered.filter((column) => column.frozen === "left")
  const rest = ordered.filter((column) => column.frozen !== "left")
  return [...frozen, ...rest].map((column) => ({
    column,
    key: column.key,
    name: columnName(column),
    visible: !hidden.has(column.key),
    frozen: column.frozen === "left",
    width: state.widths[column.key] ?? column.width,
    resized: column.key in state.widths,
    rules: rules.filter((rule) => rule.column === column.key),
  }))
}

/** True when the state changes nothing: no order, no widths, nothing hidden. */
export function isDefaultColumnState(state: ColumnState): boolean {
  return state.order.length === 0 && Object.keys(state.widths).length === 0 && state.hidden.length === 0
}

/** The state with one column shown or hidden. */
export function setColumnVisible(state: ColumnState, key: string, visible: boolean): ColumnState {
  const hidden = state.hidden.filter((k) => k !== key)
  return { ...state, hidden: visible ? hidden : [...hidden, key] }
}

/** The state with one column's width forgotten, so the column's own width is in force again. */
export function resetColumnWidth(state: ColumnState, key: string): ColumnState {
  if (!(key in state.widths)) return state
  const widths = { ...state.widths }
  delete widths[key]
  return { ...state, widths }
}

/**
 * The state with one column moved to another's place, the rest shifting to make room. A column stays
 * on its own side of the frozen line: the grid leads with frozen columns whatever the order says, so a
 * move across the line would change nothing and is refused. The full order is written, hidden columns
 * in their places, so a column shown again comes back where it was.
 */
export function moveColumnTo<T>(rows: readonly ChooserRow<T>[], state: ColumnState, key: string, targetKey: string): ColumnState {
  if (key === targetKey) return state
  const from = rows.findIndex((row) => row.key === key)
  const to = rows.findIndex((row) => row.key === targetKey)
  if (from < 0 || to < 0 || rows[from]!.frozen !== rows[to]!.frozen) return state
  const keys = rows.map((row) => row.key)
  keys.splice(from, 1)
  keys.splice(to, 0, key)
  return { ...state, order: keys }
}

/** The state with one column moved one place up (-1) or down (1), on its own side of the frozen line. */
export function moveColumnBy<T>(rows: readonly ChooserRow<T>[], state: ColumnState, key: string, delta: -1 | 1): ColumnState {
  const index = rows.findIndex((row) => row.key === key)
  const target = rows[index + delta]
  if (index < 0 || !target) return state
  return moveColumnTo(rows, state, key, target.key)
}

interface RowProps<T> {
  row: ChooserRow<T>
  canMoveUp: boolean
  canMoveDown: boolean
  dragging: boolean
  labels: ColumnChooserLabels
  onVisible: (visible: boolean) => void
  onMove: (delta: -1 | 1) => void
  onResetWidth: () => void
  onDragStart: (event: DragEvent<HTMLLIElement>) => void
  onDragOver: (event: DragEvent<HTMLLIElement>) => void
  onDrop: (event: DragEvent<HTMLLIElement>) => void
  onDragEnd: () => void
}

function Row<T>({ row, canMoveUp, canMoveDown, dragging, labels, onVisible, onMove, onResetWidth, onDragStart, onDragOver, onDrop, onDragEnd }: RowProps<T>) {
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return
    event.preventDefault()
    event.stopPropagation()
    onMove(event.key === "ArrowUp" ? -1 : 1)
  }
  return (
    <li
      tabIndex={0}
      draggable
      data-column={row.key}
      data-visible={row.visible ? "true" : "false"}
      data-frozen={row.frozen || undefined}
      data-dragging={dragging || undefined}
      aria-label={row.name}
      className={cn(
        "group flex items-center gap-2 rounded-sm border border-transparent px-1.5 py-1 outline-none focus-visible:border-ring data-[dragging]:opacity-50",
        !row.visible && "text-muted-foreground",
      )}
      onKeyDown={onKeyDown}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span aria-hidden className="cursor-grab select-none text-muted-foreground" title={labels.dragHint}>
        <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
          <circle cx="2" cy="2" r="1.2" />
          <circle cx="6" cy="2" r="1.2" />
          <circle cx="2" cy="6" r="1.2" />
          <circle cx="6" cy="6" r="1.2" />
          <circle cx="2" cy="10" r="1.2" />
          <circle cx="6" cy="10" r="1.2" />
        </svg>
      </span>
      <Checkbox checked={row.visible} onCheckedChange={() => onVisible(!row.visible)} aria-label={`${labels.show} ${row.name}`} />
      <span className="min-w-20 flex-1 truncate font-medium" title={row.name}>
        {row.name}
      </span>
      {row.frozen && (
        <Badge variant="outline" className="h-4 px-1.5 text-xs" data-column-frozen>
          {labels.frozen}
        </Badge>
      )}
      {/* A rule's words give way before the column's name does: the badge shrinks and its text ellipsizes (the badge is a flex box, so the text needs its own span to truncate), the name keeps its minimum. */}
      {row.rules.map((rule) => (
        <Badge key={rule.id} variant="outline" className={cn("h-4 min-w-0 shrink px-1.5 text-xs", RULE_TONE_CLASS[rule.tone])} data-column-rule={rule.id} title={describeRule(rule, [row.column])}>
          <span className="min-w-0 truncate">{rule.label?.trim() || describeRule(rule, [row.column])}</span>
        </Badge>
      ))}
      <span className={cn("w-14 shrink-0 text-right text-muted-foreground", NUMERIC_CLASS)} aria-label={`${labels.width} ${row.width}`} data-column-width={row.width}>
        {row.width} px
      </span>
      <Button type="button" variant="ghost" size="sm" className={cn("h-6 px-1.5 text-xs", !row.resized && "invisible")} aria-label={`${labels.resetWidth}: ${row.name}`} aria-hidden={!row.resized || undefined} tabIndex={row.resized ? undefined : -1} onClick={onResetWidth}>
        {labels.resetWidth}
      </Button>
      <span className="flex shrink-0 items-center">
        <Button type="button" variant="ghost" size="sm" className="h-6 w-6 px-0 text-xs" aria-label={`${labels.moveUp}: ${row.name}`} disabled={!canMoveUp} onClick={() => onMove(-1)}>
          <span aria-hidden>▲</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-6 w-6 px-0 text-xs" aria-label={`${labels.moveDown}: ${row.name}`} disabled={!canMoveDown} onClick={() => onMove(1)}>
          <span aria-hidden>▼</span>
        </Button>
      </span>
    </li>
  )
}

/** The list inline: for a sheet, a tab, or a settings page of your own. */
export function ColumnChooserPanel<T>({ columns, columnState, onColumnStateChange, rules, labels: labelsProp, className }: ColumnChooserPanelProps<T>) {
  const labels = { ...DEFAULT_COLUMN_CHOOSER_LABELS, ...labelsProp }
  const rows = useMemo(() => chooserRows(columns, columnState, rules), [columns, columnState, rules])
  const [query, setQuery] = useState("")
  const [dragging, setDragging] = useState<string | null>(null)
  const q = query.trim().toLowerCase()
  const shown = q ? rows.filter((row) => row.name.toLowerCase().includes(q) || row.key.toLowerCase().includes(q)) : rows
  const hiddenCount = rows.filter((row) => !row.visible).length
  const sideOf = (key: string) => rows.find((row) => row.key === key)?.frozen
  const change = (next: ColumnState) => {
    if (next !== columnState) onColumnStateChange(next)
  }
  return (
    <div role="group" aria-label={labels.title} data-slot="tradecn-column-chooser" data-hidden={hiddenCount} className={cn("flex flex-col gap-2 text-xs lining-nums tabular-nums", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={query} aria-label={labels.search} placeholder={labels.search} spellCheck={false} autoComplete="off" className="h-7 max-w-56 text-xs md:text-xs" onChange={(event) => setQuery(event.target.value)} />
        <span className={cn("text-muted-foreground", NUMERIC_CLASS)} data-column-hidden-count={hiddenCount}>
          {hiddenCount} {labels.hidden}
        </span>
        <Button type="button" variant="outline" size="sm" className="ml-auto h-7 px-2 text-xs" disabled={isDefaultColumnState(columnState)} onClick={() => change(EMPTY_COLUMN_STATE)}>
          {labels.resetAll}
        </Button>
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col" aria-label={labels.title}>
          {shown.map((row) => {
            const index = rows.indexOf(row)
            const up = rows[index - 1]
            const down = rows[index + 1]
            return (
              <Row
                key={row.key}
                row={row}
                canMoveUp={up !== undefined && up.frozen === row.frozen}
                canMoveDown={down !== undefined && down.frozen === row.frozen}
                dragging={dragging === row.key}
                labels={labels}
                onVisible={(visible) => change(setColumnVisible(columnState, row.key, visible))}
                onMove={(delta) => change(moveColumnBy(rows, columnState, row.key, delta))}
                onResetWidth={() => change(resetColumnWidth(columnState, row.key))}
                onDragStart={(event) => {
                  event.dataTransfer?.setData?.("text/plain", row.key)
                  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"
                  setDragging(row.key)
                }}
                onDragOver={(event) => {
                  const from = dragging
                  if (from === null || from === row.key || sideOf(from) !== row.frozen) return
                  event.preventDefault()
                  if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const from = dragging ?? event.dataTransfer?.getData?.("text/plain") ?? null
                  setDragging(null)
                  if (from) change(moveColumnTo(rows, columnState, from, row.key))
                }}
                onDragEnd={() => setDragging(null)}
              />
            )
          })}
        </ul>
      )}
      <p className="text-muted-foreground">{labels.dragHint}</p>
    </div>
  )
}

/** The dialog: the panel under a title, over the page, a hotkey wall while it is open. */
export function ColumnChooser<T>({ open, onOpenChange, labels: labelsProp, className, ...panel }: ColumnChooserProps<T>) {
  const labels = { ...DEFAULT_COLUMN_CHOOSER_LABELS, ...labelsProp }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-lg", className)}>
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>
        <ColumnChooserPanel {...panel} labels={labels} />
      </DialogContent>
    </Dialog>
  )
}
