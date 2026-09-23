import { cn } from "cn"
import { memo, useMemo, useRef } from "react"
import { useFlash } from "@/registry/tradecn/hooks/use-flash"
import { useRow } from "@/registry/tradecn/hooks/use-row-store"
import { NULL_TOKEN, NUMERIC_CLASS, formatBps, formatTicks, ticksBetween, type InstrumentConvention, type Nullable } from "@/registry/tradecn/lib/format"
import type { RowId, RowStore } from "@/registry/tradecn/lib/row-store"

// A spread matrix: instruments down the side and across the top, each cell the spread of the row over the
// column, in ticks of price or basis points of yield, printed with its sign and flashing by the direction it
// moved. Every row reads its own quote and every cell the column's, so a quote that moves wakes the cells it
// is part of and nothing else. Given a list of structures (curves and butterflies as weighted legs) the matrix
// lists those as rows instead of the full grid. It reads quotes and prints spreads; it stages and sends nothing.

/** What a spread is measured in: ticks of price, or basis points of yield. */
export type SpreadBasis = "ticks" | "bps"

/** One axis entry of the matrix. */
export interface SpreadInstrument {
  /** The quote's row id in the store. */
  id: RowId
  /** The header text. */
  label: string
  /** The tick a spread in ticks is counted in when this instrument is the row. */
  convention: InstrumentConvention
}

/**
 * A quote as the default reader expects it: `price` for a spread in ticks, `yield` in percent for one in basis
 * points. Pass `value` to read other fields.
 */
export interface SpreadQuote {
  price?: number | null
  yield?: number | null
}

/** A curve or a butterfly: two or three legs, each an instrument's id, with a weight per leg. */
export interface SpreadStructure {
  id: string
  label: string
  legs: readonly [RowId, RowId] | readonly [RowId, RowId, RowId]
  /** One weight per leg. Default `[-1, 1]` for two legs (the second less the first) and `[-1, 2, -1]` for three (the belly against the wings). */
  weights?: readonly number[]
  /** The tick a spread in ticks is counted in. Default: the first leg's instrument. */
  tick?: number
}

export interface SpreadMatrixLabels {
  /** The corner header of the matrix, followed by the unit. */
  instrument: string
  /** Headers of the structures list. */
  structure: string
  legs: string
  spread: string
  /** The unit words. */
  ticks: string
  bps: string
  /** Read to a screen reader as the table's caption: which side of a cell is which. */
  rule: string
}

export const DEFAULT_SPREAD_MATRIX_LABELS: SpreadMatrixLabels = {
  instrument: "Instrument",
  structure: "Structure",
  legs: "Legs",
  spread: "Spread",
  ticks: "ticks",
  bps: "bp",
  rule: "Each cell is the row less the column.",
}

export interface SpreadMatrixProps<T extends object = SpreadQuote> {
  /** Quotes keyed by instrument id. */
  store: RowStore<T>
  /** The rows, and the columns unless `columns` is given, in this order. */
  instruments: readonly SpreadInstrument[]
  /** A different set across the top, for a matrix of one set against another. */
  columns?: readonly SpreadInstrument[]
  /** Ticks of price or basis points of yield. Default `ticks`. */
  basis?: SpreadBasis
  /** Curves and butterflies. When given, the matrix lists these as rows instead of the full grid. */
  structures?: readonly SpreadStructure[]
  /** Read a quote's value in the basis. Default: `price` for ticks, `yield` for basis points. Keep it stable between renders. */
  value?: (quote: T, basis: SpreadBasis) => Nullable
  /** Print a spread. `formatSpread` by default. Keep it stable between renders. */
  format?: (value: number, basis: SpreadBasis) => string
  /** Accessible name of the table. */
  label: string
  labels?: Partial<SpreadMatrixLabels>
  /** Cell flash duration in ms. Default 900. */
  flashWindowMs?: number
  className?: string
}

const FILL_CLASSES = "data-[direction=up]:bg-up-soft data-[direction=down]:bg-down-soft data-[direction=flat]:bg-flat-soft"
const CELL = "h-7 px-2 text-right whitespace-nowrap"
const HEAD = "h-7 px-2 font-normal text-muted-foreground whitespace-nowrap"

function isNumber(v: Nullable): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

/** The default weights of a structure: the second leg less the first, or the belly against the wings. Empty for any other count. */
export function defaultWeights(legs: number): readonly number[] {
  return legs === 2 ? [-1, 1] : legs === 3 ? [-1, 2, -1] : []
}

/** A difference of values in the basis: ticks of `tick`, to the nearest eighth, or basis points from yields in percent, to a thousandth. */
function toBasis(diff: number, basis: SpreadBasis, tick: number): number | null {
  if (basis === "ticks") {
    const ticks = ticksBetween(diff, 0, tick)
    return Number.isNaN(ticks) ? null : ticks
  }
  return Math.round(diff * 100 * 1000) / 1000
}

/** The spread of `a` over `b`: `a − b` in ticks of `tick` or in basis points. Null when a side is missing. */
export function spreadBetween(a: Nullable, b: Nullable, basis: SpreadBasis, tick: number): number | null {
  if (!isNumber(a) || !isNumber(b)) return null
  return toBasis(a - b, basis, tick)
}

/** A structure's spread: each leg's value times its weight, summed, in the basis. Null when a leg is missing or the weights do not match the legs. */
export function structureSpread(values: readonly Nullable[], weights: readonly number[] | undefined, basis: SpreadBasis, tick: number): number | null {
  const w = weights ?? defaultWeights(values.length)
  if (w.length !== values.length || values.length === 0) return null
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (!isNumber(v)) return null
    sum += w[i]! * v
  }
  return toBasis(sum, basis, tick)
}

/** A spread with its sign: `+1.5`, `−0.5`, `0` in ticks; `+12.3`, `−0.8` in basis points. The unit is in the header, not the cell. */
export function formatSpread(value: Nullable, basis: SpreadBasis): string {
  return basis === "ticks" ? formatTicks(value) : formatBps(value, { signed: true, unit: "" })
}

/** The default reader: `price` for a spread in ticks, `yield` for one in basis points. */
function defaultValue(quote: object, basis: SpreadBasis): Nullable {
  if (basis === "bps") return "yield" in quote && typeof quote.yield === "number" ? quote.yield : null
  return "price" in quote && typeof quote.price === "number" ? quote.price : null
}

interface CellProps<T extends object> {
  store: RowStore<T>
  rowId: RowId
  columnId: RowId
  /** The row's value in the basis, or null while its quote is missing. */
  rowValue: number | null
  tick: number
  basis: SpreadBasis
  read: (quote: T, basis: SpreadBasis) => Nullable
  format: (value: number, basis: SpreadBasis) => string
  windowMs: number
}

function MatrixCellInner<T extends object>(p: CellProps<T>) {
  const quote = useRow(p.store, p.columnId)
  const diagonal = p.rowId === p.columnId
  const spread = diagonal ? null : spreadBetween(p.rowValue, quote === undefined ? null : p.read(quote, p.basis), p.basis, p.tick)
  const ref = useRef<HTMLTableCellElement>(null)
  // One flash per move: the spread between these two instruments changed.
  useFlash(ref, spread, { windowMs: p.windowMs, variant: "fill", disabled: diagonal })
  return (
    <td ref={ref} data-row={p.rowId} data-column={p.columnId} data-diagonal={diagonal ? "" : undefined} data-numeric="" className={cn(CELL, NUMERIC_CLASS, FILL_CLASSES, diagonal && "bg-muted/40")}>
      {diagonal ? "" : spread === null ? NULL_TOKEN : p.format(spread, p.basis)}
    </td>
  )
}
const MatrixCell = memo(MatrixCellInner) as typeof MatrixCellInner

interface RowProps<T extends object> {
  store: RowStore<T>
  instrument: SpreadInstrument
  columns: readonly SpreadInstrument[]
  basis: SpreadBasis
  read: (quote: T, basis: SpreadBasis) => Nullable
  format: (value: number, basis: SpreadBasis) => string
  windowMs: number
}

function MatrixRowInner<T extends object>(p: RowProps<T>) {
  const quote = useRow(p.store, p.instrument.id)
  const raw = quote === undefined ? null : p.read(quote, p.basis)
  const rowValue = isNumber(raw) ? raw : null
  return (
    <tr data-row={p.instrument.id} className="border-t border-border/60">
      <th scope="row" className={cn(HEAD, "text-left text-foreground")}>
        {p.instrument.label}
      </th>
      {p.columns.map((column) => (
        <MatrixCell key={column.id} store={p.store} rowId={p.instrument.id} columnId={column.id} rowValue={rowValue} tick={p.instrument.convention.tick} basis={p.basis} read={p.read} format={p.format} windowMs={p.windowMs} />
      ))}
    </tr>
  )
}
const MatrixRow = memo(MatrixRowInner) as typeof MatrixRowInner

interface StructureRowProps<T extends object> {
  store: RowStore<T>
  structure: SpreadStructure
  instruments: ReadonlyMap<RowId, SpreadInstrument>
  basis: SpreadBasis
  read: (quote: T, basis: SpreadBasis) => Nullable
  format: (value: number, basis: SpreadBasis) => string
  windowMs: number
}

function StructureRowInner<T extends object>(p: StructureRowProps<T>) {
  const legs = p.structure.legs
  const a = legs[0]
  const b = legs[1]
  const c = legs.length === 3 ? legs[2] : undefined
  // Three subscriptions whatever the leg count, so the hook count never changes; a curve's third reads its second again.
  const qa = useRow(p.store, a)
  const qb = useRow(p.store, b)
  const qc = useRow(p.store, c ?? b)
  const values = (c === undefined ? [qa, qb] : [qa, qb, qc]).map((quote) => (quote === undefined ? null : p.read(quote, p.basis)))
  const tick = p.structure.tick ?? p.instruments.get(a)?.convention.tick ?? NaN
  const spread = structureSpread(values, p.structure.weights, p.basis, tick)
  const ref = useRef<HTMLTableCellElement>(null)
  useFlash(ref, spread, { windowMs: p.windowMs, variant: "fill" })
  const legLabels = legs.map((id) => p.instruments.get(id)?.label ?? id).join(" / ")
  const weights = (p.structure.weights ?? defaultWeights(legs.length)).join(" ")
  return (
    <tr data-structure={p.structure.id} data-weights={weights} className="border-t border-border/60">
      <th scope="row" className={cn(HEAD, "text-left text-foreground")}>
        {p.structure.label}
      </th>
      <td data-legs="" className={cn(HEAD, "text-left")}>
        {legLabels}
      </td>
      <td ref={ref} data-spread="" data-numeric="" className={cn(CELL, NUMERIC_CLASS, FILL_CLASSES)}>
        {spread === null ? NULL_TOKEN : p.format(spread, p.basis)}
      </td>
    </tr>
  )
}
const StructureRow = memo(StructureRowInner) as typeof StructureRowInner

export function SpreadMatrix<T extends object = SpreadQuote>({ store, instruments, columns, basis = "ticks", structures, value, format = formatSpread, label, labels: labelsProp, flashWindowMs = 900, className }: SpreadMatrixProps<T>) {
  const labels = useMemo<SpreadMatrixLabels>(() => ({ ...DEFAULT_SPREAD_MATRIX_LABELS, ...labelsProp }), [labelsProp])
  const read: (quote: T, basis: SpreadBasis) => Nullable = value ?? defaultValue
  const across = columns ?? instruments
  const byId = useMemo(() => new Map(instruments.concat(columns ?? []).map((i) => [i.id, i])), [instruments, columns])
  const unit = labels[basis]
  const mode = structures ? "structures" : "matrix"
  return (
    <div data-slot="tradecn-spread-matrix" data-basis={basis} data-mode={mode} className={cn("overflow-auto rounded-md border border-border bg-background text-xs text-foreground lining-nums tabular-nums", className)}>
      <table aria-label={label} className="w-full border-collapse">
        <caption className="sr-only">{mode === "matrix" ? `${labels.rule} ${unit}.` : `${labels.spread}: ${unit}.`}</caption>
        <thead>
          {mode === "matrix" ? (
            <tr>
              <th scope="col" data-unit={basis} className={cn(HEAD, "text-left")}>
                {labels.instrument} <span className="text-muted-foreground/80">({unit})</span>
              </th>
              {across.map((column) => (
                <th key={column.id} scope="col" data-column={column.id} className={HEAD}>
                  {column.label}
                </th>
              ))}
            </tr>
          ) : (
            <tr>
              <th scope="col" className={cn(HEAD, "text-left")}>
                {labels.structure}
              </th>
              <th scope="col" className={cn(HEAD, "text-left")}>
                {labels.legs}
              </th>
              <th scope="col" data-unit={basis} className={HEAD}>
                {labels.spread} <span className="text-muted-foreground/80">({unit})</span>
              </th>
            </tr>
          )}
        </thead>
        <tbody>
          {structures
            ? structures.map((structure) => <StructureRow key={structure.id} store={store} structure={structure} instruments={byId} basis={basis} read={read} format={format} windowMs={flashWindowMs} />)
            : instruments.map((instrument) => <MatrixRow key={instrument.id} store={store} instrument={instrument} columns={across} basis={basis} read={read} format={format} windowMs={flashWindowMs} />)}
        </tbody>
      </table>
    </div>
  )
}
