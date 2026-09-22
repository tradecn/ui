import { cn } from "cn"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { useStoreMeta } from "@/registry/tradecn/hooks/use-row-store"
import { NULL_TOKEN, NUMERIC_CLASS, formatPrice } from "@/registry/tradecn/lib/format"
import type { RowId, RowStore } from "@/registry/tradecn/lib/row-store"
import { DataGrid, editProblem, type CellEdit, type CellEditHandle, type ColumnDef, type DataGridProps, type EditChange, type EditProblem } from "@/registry/tradecn/ui/data-grid"

// A parameter table: the data grid in its parameters preset, one row per instrument, tier, or pair,
// a frozen name, a server-owned enable box, the values typed in place, and when the server last
// changed each row. Every edit is a command the server answers: the cell shows what was typed as
// pending until the row comes back with it, and a rejection prints the server's message in the cell.
// Nothing here decides a value, and nothing flips a row on or off by itself.

export interface ParameterRow {
  id: string
  /** The row's name: the instrument, the tier, the pair. The frozen first column. */
  name: string
  /** The server's word on whether the row is in force. Shown as a checkbox that asks; never flipped here. */
  enabled?: boolean
  /** What the server allows on this row, by id: the toggle action lets the box ask, the edit action lets a value be typed. Nothing without a list. */
  allowedActions?: readonly string[]
  /** When the server last changed the row, ms since the epoch, and who did. */
  updatedAt?: number | null
  updatedBy?: string | null
}

export interface ParameterDef<T extends ParameterRow> {
  key: string
  header: string
  width?: number
  accessor: (row: T) => unknown
  /** Prints the value. Default: a number to `decimals` places, the null token for null, the text for the rest. */
  format?: (value: unknown, row: T) => string
  /** Reads what was typed. Default: a number, with separators allowed, blank for null. */
  parse?: (text: string, row: T) => unknown
  /** A check before the commit, after `min` and `max`. */
  validate?: (value: unknown, row: T) => EditProblem | null | undefined
  /** A number steps by that much, ten times with Shift; a function is the grid's own `step`. Left out, the arrows do nothing. */
  step?: number | ((value: unknown, dir: 1 | -1, big: boolean, row: T) => unknown)
  min?: number
  max?: number
  /** Places for the default format. Default 2. */
  decimals?: number
  /** Numeric by default: right-aligned, tabular figures, flashing by direction. False for a text parameter. */
  numeric?: boolean
  font?: "numeric" | "mono"
  /** Shown and never edited. */
  readOnly?: boolean
}

export interface ParameterGridLabels {
  /** The name column's header. */
  name: string
  /** The enable column's header. */
  enabled: string
  /** The box's name while the row is off. `{name}` is the row's. */
  enable: string
  /** The box's name while the row is on. */
  disable: string
  /** The updated column's header. */
  updated: string
  /** Said of a row changed since `changedSince`. */
  changed: string
  /** The line above the grid. `{time}` is the store's `producedAt`. */
  asOf: string
  notANumber: string
  /** `{n}` the value, `{min}` or `{max}` the line. */
  belowMin: string
  aboveMax: string
}

export const DEFAULT_PARAMETER_GRID_LABELS: ParameterGridLabels = {
  name: "Name",
  enabled: "On",
  enable: "Enable {name}",
  disable: "Disable {name}",
  updated: "Updated",
  changed: "Changed",
  asOf: "As of {time}",
  notANumber: "Not a number.",
  belowMin: "{n} is below the minimum of {min}.",
  aboveMax: "{n} is above the maximum of {max}.",
}

let clockFormat: Intl.DateTimeFormat | null = null
const localTime = (ms: number) => (clockFormat ??= new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })).format(ms)

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")

/** True when the server's list for the row names the action. */
export function allowsAction(row: ParameterRow, action: string): boolean {
  return row.allowedActions?.includes(action) === true
}

function defaultFormat<T extends ParameterRow>(def: ParameterDef<T>): (value: unknown, row: T) => string {
  const decimals = def.decimals ?? 2
  return (value) => {
    if (value === null || value === undefined) return NULL_TOKEN
    if (typeof value === "number") return formatPrice(value, { kind: "decimal", decimals })
    return String(value)
  }
}

function defaultParse(labels: ParameterGridLabels): (text: string) => unknown {
  return (text) => {
    const clean = text.trim().replace(/−/g, "-").replace(/,/g, "")
    if (clean === "") return null
    const n = Number(clean)
    return Number.isFinite(n) ? n : editProblem(labels.notANumber)
  }
}

/** The grid's `edit` for one parameter: its parse, its format, the range check, and the step. */
export function parameterEdit<T extends ParameterRow>(def: ParameterDef<T>, editAction: string, labels: ParameterGridLabels = DEFAULT_PARAMETER_GRID_LABELS): CellEdit<T> {
  const format = def.format ?? defaultFormat(def)
  const parse = def.parse ?? defaultParse(labels)
  const step = typeof def.step === "number" ? (def.step as number) : null
  return {
    parse,
    format,
    validate(value, row) {
      if (typeof value === "number") {
        const n = format(value, row)
        if (def.min !== undefined && value < def.min) return editProblem(fill(labels.belowMin, { n, min: format(def.min, row) }))
        if (def.max !== undefined && value > def.max) return editProblem(fill(labels.aboveMax, { n, max: format(def.max, row) }))
      }
      return def.validate?.(value, row) ?? null
    },
    step:
      typeof def.step === "function"
        ? def.step
        : step !== null
          ? (value, dir, big) => {
              const from = typeof value === "number" ? value : 0
              // Ten decimal places is past any parameter's step and under a double's noise.
              return Number((from + dir * step * (big ? 10 : 1)).toFixed(10))
            }
          : undefined,
    canEdit: (row) => !def.readOnly && allowsAction(row, editAction),
  }
}

export interface ParameterColumnOptions<T extends ParameterRow> {
  parameters: readonly ParameterDef<T>[]
  labels?: Partial<ParameterGridLabels>
  /** How to print the updated time. Local HH:MM:SS by default. */
  time?: (ms: number) => string
  /** Rows changed at or after this moment wear the mark. */
  changedSince?: number | null
  /** The id the server allows for the enable box. Default `toggle`. */
  toggleAction?: string
  /** The id the server allows for typing a value. Default `edit`. */
  editAction?: string
}

interface EnableBoxProps {
  row: ParameterRow
  value: boolean
  edit: CellEditHandle | undefined
  allowed: boolean
  labels: ParameterGridLabels
}

// The consumer's checkbox, out of the tab order (the grid is one stop and Space asks from the keyboard),
// asking the server through the cell's own handle and never flipping itself: `checked` is the row's word.
function EnableBox({ row, value, edit, allowed, labels }: EnableBoxProps) {
  const pending = edit?.status?.kind === "pending"
  return (
    <Checkbox
      checked={value}
      disabled={!edit || !allowed || pending}
      tabIndex={-1}
      aria-label={fill(value ? labels.disable : labels.enable, { name: row.name })}
      data-parameter-enabled={String(value)}
      onCheckedChange={() => edit?.commit(!value)}
    />
  )
}

/** Name, the enable box, one column per parameter, and the updated time. Spread them into your own list to add, drop, or reorder. */
export function parameterColumns<T extends ParameterRow>(options: ParameterColumnOptions<T>): ColumnDef<T>[] {
  const labels = { ...DEFAULT_PARAMETER_GRID_LABELS, ...options.labels }
  const time = options.time ?? localTime
  const since = options.changedSince ?? null
  const toggleAction = options.toggleAction ?? "toggle"
  const editAction = options.editAction ?? "edit"
  const changed = (row: T) => since !== null && row.updatedAt !== null && row.updatedAt !== undefined && row.updatedAt >= since
  const name: ColumnDef<T> = {
    key: "name",
    header: labels.name,
    width: 160,
    frozen: "left",
    sortable: true,
    flash: false,
    accessor: (r) => r.name,
    cell: ({ row }) => (
      <span className="flex min-w-0 items-center gap-1.5">
        {changed(row) && <span aria-hidden data-parameter-changed="" className="size-1.5 shrink-0 rounded-full bg-primary" />}
        <span className="truncate font-medium">{row.name}</span>
      </span>
    ),
  }
  const enabled: ColumnDef<T> = {
    key: "enabled",
    header: labels.enabled,
    width: 56,
    align: "center",
    sortable: true,
    flash: false,
    accessor: (r) => r.enabled === true,
    edit: { parse: (text) => /^(on|true|yes|1)$/i.test(text.trim()), toggle: (value) => !value, canEdit: (row) => allowsAction(row, toggleAction) },
    cell: ({ row, value, edit }) => <EnableBox row={row} value={value === true} edit={edit} allowed={allowsAction(row, toggleAction)} labels={labels} />,
  }
  const values = options.parameters.map((def): ColumnDef<T> => {
    const edit = parameterEdit(def, editAction, labels)
    return {
      key: def.key,
      header: def.header,
      width: def.width ?? 96,
      numeric: def.numeric ?? true,
      font: def.font,
      sortable: true,
      accessor: def.accessor,
      format: edit.format,
      edit: def.readOnly ? undefined : edit,
    }
  })
  const updated: ColumnDef<T> = {
    key: "updated",
    header: labels.updated,
    width: 140,
    flash: "fill",
    sortable: true,
    accessor: (r) => r.updatedAt ?? null,
    cell: ({ row }) =>
      row.updatedAt === null || row.updatedAt === undefined ? (
        <span className="text-muted-foreground">{NULL_TOKEN}</span>
      ) : (
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span data-numeric="" className={NUMERIC_CLASS}>
            {time(row.updatedAt)}
          </span>
          {row.updatedBy && <span className="truncate text-muted-foreground">{row.updatedBy}</span>}
        </span>
      ),
  }
  return [name, enabled, ...values, updated]
}

export interface ParameterGridProps<T extends ParameterRow = ParameterRow> extends Omit<DataGridProps<T>, "columns" | "preset" | "label" | "onEdit">, ParameterColumnOptions<T> {
  /** `parameterColumns(options)` by default. */
  columns?: ColumnDef<T>[]
  label?: string
  /** A cell was edited, or the box asked: send it to the server. The cell stays pending until the row comes back with the value, or the promise resolves. */
  onEdit: (change: EditChange<T>) => void | Promise<unknown>
  /** The line above the grid with the store's `producedAt`. Default: shown. */
  asOf?: boolean
}

// Its own component on the store's meta, so the line ticks once per applied batch and the grid around it does not.
function AsOf<T>({ store, time, labels }: { store: RowStore<T>; time: (ms: number) => string; labels: ParameterGridLabels }) {
  const meta = useStoreMeta(store)
  const at = meta.producedAt ?? meta.lastBatchAt
  return (
    <div data-parameter-asof={at ?? ""} className="shrink-0 text-xs text-muted-foreground lining-nums tabular-nums">
      {at === null ? NULL_TOKEN : fill(labels.asOf, { time: time(at) })}
    </div>
  )
}

export function ParameterGrid<T extends ParameterRow = ParameterRow>({ parameters, labels: labelsProp, time, changedSince = null, toggleAction = "toggle", editAction = "edit", columns, label = "Parameters", onEdit, asOf = true, className, store, getRowProps, ...grid }: ParameterGridProps<T>) {
  const labels = useMemo(() => ({ ...DEFAULT_PARAMETER_GRID_LABELS, ...labelsProp }), [labelsProp])
  const timeFn = time ?? localTime
  // The grid's rows are memoized, so what it is handed keeps its identity from one render to the next; your callbacks are read through a ref.
  const latest = useRef({ onEdit, getRowProps })
  useEffect(() => {
    latest.current = { onEdit, getRowProps }
  })
  const all = useMemo(() => columns ?? parameterColumns<T>({ parameters, labels, time: timeFn, changedSince, toggleAction, editAction }), [columns, parameters, labels, timeFn, changedSince, toggleAction, editAction])
  const edit = useCallback((change: EditChange<T>) => latest.current.onEdit(change), [])
  // A changed row says so to a screen reader; the dot in its name cell is the mark a sighted reader sees.
  const rowProps = useCallback(
    (row: T, id: RowId) => {
      const own = latest.current.getRowProps?.(row, id)
      const changed = changedSince !== null && row.updatedAt !== null && row.updatedAt !== undefined && row.updatedAt >= changedSince
      if (!changed) return own
      return { ...own, "aria-description": own?.["aria-description"] ?? labels.changed }
    },
    [changedSince, labels.changed],
  )
  return (
    <div data-slot="tradecn-parameter-grid" className={cn("flex h-full min-h-0 flex-col gap-1 lining-nums tabular-nums", className)}>
      {asOf && <AsOf store={store} time={timeFn} labels={labels} />}
      <div className="min-h-0 flex-1">
        <DataGrid<T> {...grid} store={store} preset="parameters" label={label} columns={all} onEdit={edit} getRowProps={rowProps} />
      </div>
    </div>
  )
}
