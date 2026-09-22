import { cn } from "cn"
import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { NUMERIC_CLASS } from "@/registry/tradecn/lib/format"
import {
  RULE_OP_LABELS,
  RULE_TONES,
  RULE_TONE_CLASS,
  columnName,
  compileCondition,
  compileFilter,
  opsFor,
  ruleProblem,
  type ColumnRule,
  type FilterRule,
  type GridRules,
  type RuleCondition,
  type RuleOp,
  type RuleTone,
  type RuleValue,
  type SortRule,
} from "@/registry/tradecn/lib/grid-rules"
import type { RowStore } from "@/registry/tradecn/lib/row-store"
import { ColumnChooserPanel } from "@/registry/tradecn/ui/column-chooser"
import type { ColumnDef, ColumnState } from "@/registry/tradecn/ui/data-grid"

// The editor over one grid's rules: highlights, filters, and the sort stack, each a list to add to,
// edit, reorder, and remove, plus the column chooser in a fourth tab when the grid's column state is
// given. A rule is built from a column picker, an op picker that narrows by the column's kind, a value
// field in the column's own format, and, for a highlight, a tone shown in its token and what it paints.
// Beside each rule a live count says how many rows in the store it matches right now, so a rule is
// checked as it is typed. It produces `GridRules` objects through `onRulesChange` and stores nothing.

export type RulesEditorTab = "highlights" | "filters" | "sort" | "columns"

export interface RulesEditorLabels {
  title: string
  highlights: string
  filters: string
  sort: string
  columns: string
  addHighlight: string
  addFilter: string
  addSort: string
  column: string
  condition: string
  value: string
  low: string
  high: string
  /** The one field for `in`: comma separated. */
  values: string
  tone: string
  /** What a highlight paints: the cell or the row. */
  paints: string
  cell: string
  row: string
  label: string
  direction: string
  asc: string
  desc: string
  remove: string
  moveUp: string
  moveDown: string
  /** `{n}` is the count. */
  matches: string
  /** `{n}` pass of `{m}`. */
  shown: string
  noHighlights: string
  noFilters: string
  noSort: string
  dragHint: string
}

export const DEFAULT_RULES_EDITOR_LABELS: RulesEditorLabels = {
  title: "Rules",
  highlights: "Highlights",
  filters: "Filters",
  sort: "Sort",
  columns: "Columns",
  addHighlight: "Add highlight",
  addFilter: "Add filter",
  addSort: "Add sort key",
  column: "Column",
  condition: "Condition",
  value: "Value",
  low: "Low",
  high: "High",
  values: "Values, comma separated",
  tone: "Tone",
  paints: "Paints",
  cell: "the cell",
  row: "the row",
  label: "Label",
  direction: "Direction",
  asc: "ascending",
  desc: "descending",
  remove: "Remove",
  moveUp: "Move up",
  moveDown: "Move down",
  matches: "{n} rows match",
  shown: "{n} of {m} rows show",
  noHighlights: "No highlights. Add one to color a cell or a row when a value crosses a line.",
  noFilters: "No filters. Every row shows.",
  noSort: "No sort keys. Rows keep their arrival order, or the order a header sets.",
  dragHint: "Drag a rule, or hold Alt with an arrow key, to reorder. The first rule that applies wins.",
}

export interface RulesEditorProps<T> {
  columns: ColumnDef<T>[]
  rules: GridRules
  onRulesChange: (rules: GridRules) => void
  /** For the live counts: how many rows each rule matches right now. */
  store?: RowStore<T>
  /** With both, a Columns tab holds the column chooser over the same grid. */
  columnState?: ColumnState
  onColumnStateChange?: (state: ColumnState) => void
  defaultTab?: RulesEditorTab
  labels?: Partial<RulesEditorLabels>
  className?: string
}

const OPS_WITH_VALUE = new Set<RuleOp>(["eq", "ne", "gt", "gte", "lt", "lte", "contains", "startsWith"])

/** What a condition's op wants typed: one value, two (a range), many (a set), or nothing. */
export function valueShape(op: RuleOp): "one" | "two" | "many" | "none" {
  if (OPS_WITH_VALUE.has(op)) return "one"
  if (op === "between") return "two"
  if (op === "in") return "many"
  return "none"
}

/** A list of values from one field, comma separated, trimmed, empties dropped. */
export function parseValues(text: string): RuleValue[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
}

/** The one field's text for a list of values. */
export function valuesText(values: readonly RuleValue[] | undefined): string {
  return (values ?? []).map((value) => (value === null ? "" : String(value))).join(", ")
}

/** The condition with a new op: the typed values are kept when the new op wants the same shape and dropped otherwise. */
export function withOp(condition: RuleCondition, op: RuleOp): RuleCondition {
  if (valueShape(condition.op) === valueShape(op)) return { ...condition, op }
  return { op }
}

/** The condition for a new column: its op if the column offers it, else the column's first, and the values dropped either way when the op changed. */
export function withColumn<T>(condition: RuleCondition, column: ColumnDef<T> | undefined): RuleCondition {
  const ops = opsFor(column)
  return ops.includes(condition.op) ? condition : { op: ops[0]! }
}

/** A list with one item moved to another's index, the rest shifting to make room. */
export function moveItem<X>(list: readonly X[], from: number, to: number): X[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list]
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

let ruleCounter = 0
/** An id for a new highlight, unique on this page. */
export function newRuleId(): string {
  ruleCounter += 1
  return `rule-${Date.now().toString(36)}-${ruleCounter}`
}

/** A new highlight on the first column, its first op, in `up`. */
export function newHighlight<T>(columns: readonly ColumnDef<T>[]): ColumnRule {
  const column = columns[0]
  return { id: newRuleId(), column: column?.key ?? "", when: { op: opsFor(column)[0]! }, tone: "up" }
}

/** A new filter on the first column, its first op. */
export function newFilter<T>(columns: readonly ColumnDef<T>[]): FilterRule {
  const column = columns[0]
  return { column: column?.key ?? "", op: opsFor(column)[0]! }
}

/** A new sort key on the first column not yet in the list, ascending. */
export function newSort<T>(columns: readonly ColumnDef<T>[], existing: readonly SortRule[] = []): SortRule {
  const used = new Set(existing.map((rule) => rule.key))
  const column = columns.find((c) => !used.has(c.key)) ?? columns[0]
  return { key: column?.key ?? "", dir: "asc" }
}

function fill(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (values[name] ?? 0).toLocaleString())
}

/** The store's version, at most once per `ms`, so a busy feed does not redraw the editor every frame. */
function useThrottledVersion<T>(store: RowStore<T> | undefined, ms: number): number {
  const [version, setVersion] = useState(() => store?.getMeta().version ?? 0)
  useEffect(() => {
    if (!store) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = store.subscribeMeta(() => {
      if (timer !== null) return
      timer = setTimeout(() => {
        timer = null
        setVersion(store.getMeta().version)
      }, ms)
    })
    return () => {
      unsubscribe()
      if (timer !== null) clearTimeout(timer)
    }
  }, [store, ms])
  return version
}

// One empty list per kind, so a rules object without a list does not hand the memos a fresh array every render.
const NO_HIGHLIGHTS: ColumnRule[] = []
const NO_FILTERS: FilterRule[] = []
const NO_SORTS: SortRule[] = []

function countMatching<T>(store: RowStore<T>, test: (row: T) => boolean): number {
  let n = 0
  for (const id of store.getIds()) {
    const row = store.getRow(id)
    if (row !== undefined && test(row)) n++
  }
  return n
}

interface ListProps {
  count: number
  labels: RulesEditorLabels
  empty: string
  onMove: (from: number, to: number) => void
  children: (row: RowFrame) => ReactNode
}

interface RowFrame {
  /** Wrap one item's content in the list's row: drag, keyboard, and the move and remove controls. */
  item: (index: number, key: string | number, name: string, content: ReactNode, onRemove: () => void) => ReactNode
}

/** The shared frame of the three lists: a row per item, each draggable, movable by Alt+arrow or by button, removable. */
function ReorderableList({ count, labels, empty, onMove, children }: ListProps) {
  const [dragging, setDragging] = useState<number | null>(null)
  if (count === 0) return <p className="text-muted-foreground">{empty}</p>
  const item: RowFrame["item"] = (index, key, name, content, onRemove) => {
    const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
      if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return
      event.preventDefault()
      event.stopPropagation()
      const to = index + (event.key === "ArrowUp" ? -1 : 1)
      if (to >= 0 && to < count) onMove(index, to)
    }
    return (
      <li
        key={key}
        tabIndex={0}
        draggable
        data-rule-row={index}
        data-dragging={dragging === index || undefined}
        aria-label={name}
        className="flex flex-wrap items-start gap-1.5 rounded-sm border border-border/60 p-1.5 outline-none focus-visible:border-ring data-[dragging]:opacity-50"
        onKeyDown={onKeyDown}
        onDragStart={(event: DragEvent<HTMLLIElement>) => {
          event.dataTransfer?.setData?.("text/plain", String(index))
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"
          setDragging(index)
        }}
        onDragOver={(event: DragEvent<HTMLLIElement>) => {
          if (dragging === null || dragging === index) return
          event.preventDefault()
          if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
        }}
        onDrop={(event: DragEvent<HTMLLIElement>) => {
          event.preventDefault()
          const from = dragging ?? Number(event.dataTransfer?.getData?.("text/plain") ?? NaN)
          setDragging(null)
          if (Number.isInteger(from) && from !== index) onMove(from, index)
        }}
        onDragEnd={() => setDragging(null)}
      >
        <span aria-hidden className="mt-1.5 cursor-grab select-none text-muted-foreground" title={labels.dragHint}>
          <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
            <circle cx="2" cy="2" r="1.2" />
            <circle cx="6" cy="2" r="1.2" />
            <circle cx="2" cy="6" r="1.2" />
            <circle cx="6" cy="6" r="1.2" />
            <circle cx="2" cy="10" r="1.2" />
            <circle cx="6" cy="10" r="1.2" />
          </svg>
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{content}</div>
        <span className="flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 px-0 text-xs" aria-label={`${labels.moveUp}: ${name}`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
            <span aria-hidden>▲</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 px-0 text-xs" aria-label={`${labels.moveDown}: ${name}`} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
            <span aria-hidden>▼</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" aria-label={`${labels.remove}: ${name}`} onClick={onRemove}>
            <span aria-hidden>×</span>
          </Button>
        </span>
      </li>
    )
  }
  return <ul className="flex flex-col gap-1">{children({ item })}</ul>
}

interface ConditionFieldsProps<T> {
  name: string
  column: ColumnDef<T> | undefined
  columns: ColumnDef<T>[]
  condition: RuleCondition
  columnKey: string
  labels: RulesEditorLabels
  onColumn: (key: string) => void
  onCondition: (condition: RuleCondition) => void
}

/** The column picker, the op picker narrowed by the column, and the value fields the op wants. */
function ConditionFields<T>({ name, column, columns, condition, columnKey, labels, onColumn, onCondition }: ConditionFieldsProps<T>) {
  const ops = opsFor(column)
  const shape = valueShape(condition.op)
  const text = (value: RuleValue | undefined) => (value === undefined || value === null ? "" : String(value))
  return (
    <>
      <NativeSelect size="sm" value={columnKey} aria-label={`${labels.column}: ${name}`} data-rule-field="column" onChange={(event) => onColumn(event.target.value)}>
        {!columns.some((c) => c.key === columnKey) && <NativeSelectOption value={columnKey}>{columnKey}</NativeSelectOption>}
        {columns.map((c) => (
          <NativeSelectOption key={c.key} value={c.key}>
            {columnName(c)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect size="sm" value={condition.op} aria-label={`${labels.condition}: ${name}`} data-rule-field="op" onChange={(event) => onCondition(withOp(condition, event.target.value as RuleOp))}>
        {ops.map((op) => (
          <NativeSelectOption key={op} value={op}>
            {RULE_OP_LABELS[op]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {shape === "one" && (
        <Input value={text(condition.value)} aria-label={`${labels.value}: ${name}`} placeholder={labels.value} spellCheck={false} autoComplete="off" data-rule-field="value" className="h-6 w-28 px-1.5 text-xs md:text-xs" onChange={(event) => onCondition({ ...condition, value: event.target.value })} />
      )}
      {shape === "two" && (
        <>
          <Input value={text(condition.values?.[0])} aria-label={`${labels.low}: ${name}`} placeholder={labels.low} spellCheck={false} autoComplete="off" data-rule-field="low" className="h-6 w-24 px-1.5 text-xs md:text-xs" onChange={(event) => onCondition({ ...condition, values: [event.target.value, condition.values?.[1] ?? ""] })} />
          <Input value={text(condition.values?.[1])} aria-label={`${labels.high}: ${name}`} placeholder={labels.high} spellCheck={false} autoComplete="off" data-rule-field="high" className="h-6 w-24 px-1.5 text-xs md:text-xs" onChange={(event) => onCondition({ ...condition, values: [condition.values?.[0] ?? "", event.target.value] })} />
        </>
      )}
      {shape === "many" && <ValuesField name={name} values={condition.values} labels={labels} onChange={(values) => onCondition({ ...condition, values })} />}
    </>
  )
}

// The comma field keeps its own text while it is typed, so "a," is not read back as "a" under the hand.
function ValuesField({ name, values, labels, onChange }: { name: string; values: RuleValue[] | undefined; labels: RulesEditorLabels; onChange: (values: RuleValue[]) => void }) {
  const [text, setText] = useState(() => valuesText(values))
  const [known, setKnown] = useState(values)
  if (values !== known) {
    setKnown(values)
    if (valuesText(parseValues(text)) !== valuesText(values)) setText(valuesText(values))
  }
  return (
    <Input
      value={text}
      aria-label={`${labels.values}: ${name}`}
      placeholder={labels.values}
      spellCheck={false}
      autoComplete="off"
      data-rule-field="values"
      className="h-6 w-40 px-1.5 text-xs md:text-xs"
      onChange={(event) => {
        setText(event.target.value)
        onChange(parseValues(event.target.value))
      }}
    />
  )
}

function Problem({ text }: { text: string | null }) {
  return text ? (
    <p className="basis-full text-destructive" data-rule-problem>
      {text}
    </p>
  ) : null
}

function Count({ n, template }: { n: number | null; template: string }) {
  if (n === null) return null
  return (
    <span className={cn("text-muted-foreground", NUMERIC_CLASS)} data-rule-count={n}>
      {fill(template, { n })}
    </span>
  )
}

export function RulesEditor<T>({ columns, rules, onRulesChange, store, columnState, onColumnStateChange, defaultTab, labels: labelsProp, className }: RulesEditorProps<T>) {
  const labels = { ...DEFAULT_RULES_EDITOR_LABELS, ...labelsProp }
  const hasColumns = columnState !== undefined && onColumnStateChange !== undefined
  const tabs: { id: RulesEditorTab; label: string; count: number | null }[] = [
    { id: "highlights", label: labels.highlights, count: rules.columns?.length ?? 0 },
    { id: "filters", label: labels.filters, count: rules.filter?.length ?? 0 },
    { id: "sort", label: labels.sort, count: rules.sort?.length ?? 0 },
    ...(hasColumns ? [{ id: "columns" as const, label: labels.columns, count: columnState.hidden.length }] : []),
  ]
  const [tab, setTab] = useState<RulesEditorTab>(defaultTab ?? "highlights")
  const shownTab = tabs.some((t) => t.id === tab) ? tab : "highlights"
  const highlights = rules.columns ?? NO_HIGHLIGHTS
  const filters = rules.filter ?? NO_FILTERS
  const sorts = rules.sort ?? NO_SORTS
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns])

  // Live counts, on a throttled beat, from the store the grid reads.
  const version = useThrottledVersion(store, 250)
  const highlightCounts = useMemo(() => {
    void version
    if (!store) return null
    return highlights.map((rule) => {
      const column = byKey.get(rule.column)
      return column ? countMatching(store, compileCondition(rule.when, column)) : 0
    })
  }, [store, highlights, byKey, version])
  const filterCounts = useMemo(() => {
    void version
    if (!store) return null
    return filters.map((rule) => {
      const column = byKey.get(rule.column)
      return column ? countMatching(store, compileCondition(rule, column)) : 0
    })
  }, [store, filters, byKey, version])
  const shown = useMemo(() => {
    void version
    if (!store) return null
    return { n: countMatching(store, compileFilter(filters, columns)), m: store.getIds().length }
  }, [store, filters, columns, version])

  const change = (next: Partial<GridRules>) => onRulesChange({ ...rules, ...next })
  const setHighlights = (list: ColumnRule[]) => change({ columns: list })
  const setFilters = (list: FilterRule[]) => change({ filter: list })
  const setSorts = (list: SortRule[]) => change({ sort: list })
  const replaceAt = <X,>(list: readonly X[], index: number, item: X) => list.map((x, i) => (i === index ? item : x))
  const removeAt = <X,>(list: readonly X[], index: number) => list.filter((_, i) => i !== index)

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "Home" ? -index : event.key === "End" ? tabs.length - 1 - index : 0
    if (!delta) return
    event.preventDefault()
    const next = tabs[(index + delta + tabs.length) % tabs.length]!
    setTab(next.id)
    ;(event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-rules-tab="${next.id}"]`) ?? null)?.focus()
  }

  return (
    <div role="region" aria-label={labels.title} data-slot="tradecn-rules-editor" data-tab={shownTab} className={cn("flex flex-col gap-2 text-xs lining-nums tabular-nums", className)}>
      <div role="tablist" aria-label={labels.title} className="flex flex-wrap items-center gap-1">
        {tabs.map((t, index) => (
          <Button
            key={t.id}
            type="button"
            role="tab"
            id={`rules-tab-${t.id}`}
            aria-selected={shownTab === t.id}
            aria-controls={`rules-panel-${t.id}`}
            tabIndex={shownTab === t.id ? 0 : -1}
            data-rules-tab={t.id}
            variant={shownTab === t.id ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setTab(t.id)}
            onKeyDown={(event) => onTabKey(event, index)}
          >
            {t.label}
            {t.count !== null && t.count > 0 && <span className={cn("text-muted-foreground", NUMERIC_CLASS)}>{t.count}</span>}
          </Button>
        ))}
      </div>

      <div role="tabpanel" id={`rules-panel-${shownTab}`} aria-labelledby={`rules-tab-${shownTab}`} className="flex flex-col gap-2">
        {shownTab === "highlights" && (
          <>
            <ReorderableList count={highlights.length} labels={labels} empty={labels.noHighlights} onMove={(from, to) => setHighlights(moveItem(highlights, from, to))}>
              {({ item }) =>
                highlights.map((rule, index) => {
                  const column = byKey.get(rule.column)
                  const name = rule.label?.trim() || `${labels.highlights} ${index + 1}`
                  const update = (next: ColumnRule) => setHighlights(replaceAt(highlights, index, next))
                  return item(
                    index,
                    rule.id,
                    name,
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" data-rule-id={rule.id}>
                      <ConditionFields
                        name={name}
                        column={column}
                        columns={columns}
                        columnKey={rule.column}
                        condition={rule.when}
                        labels={labels}
                        onColumn={(key) => update({ ...rule, column: key, when: withColumn(rule.when, byKey.get(key)) })}
                        onCondition={(when) => update({ ...rule, when })}
                      />
                      <NativeSelect size="sm" value={rule.tone} aria-label={`${labels.tone}: ${name}`} data-rule-field="tone" onChange={(event) => update({ ...rule, tone: event.target.value as RuleTone })}>
                        {RULE_TONES.map((tone) => (
                          <NativeSelectOption key={tone} value={tone}>
                            {tone}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <span className={cn("rounded-sm px-1.5 py-0.5", RULE_TONE_CLASS[rule.tone])} data-rule-swatch={rule.tone} aria-hidden>
                        {rule.tone}
                      </span>
                      <NativeSelect size="sm" value={rule.target ?? "cell"} aria-label={`${labels.paints}: ${name}`} data-rule-field="target" onChange={(event) => update({ ...rule, target: event.target.value === "row" ? "row" : "cell" })}>
                        <NativeSelectOption value="cell">{labels.cell}</NativeSelectOption>
                        <NativeSelectOption value="row">{labels.row}</NativeSelectOption>
                      </NativeSelect>
                      <Input value={rule.label ?? ""} aria-label={`${labels.label}: ${name}`} placeholder={labels.label} spellCheck={false} autoComplete="off" data-rule-field="label" className="h-6 w-36 px-1.5 text-xs md:text-xs" onChange={(event) => update({ ...rule, label: event.target.value })} />
                      <Count n={highlightCounts ? (highlightCounts[index] ?? 0) : null} template={labels.matches} />
                      <Problem text={ruleProblem(rule, columns)} />
                    </div>,
                    () => setHighlights(removeAt(highlights, index)),
                  )
                })
              }
            </ReorderableList>
            <Button type="button" variant="outline" size="sm" className="h-7 self-start px-2 text-xs" onClick={() => setHighlights([...highlights, newHighlight(columns)])}>
              {labels.addHighlight}
            </Button>
          </>
        )}

        {shownTab === "filters" && (
          <>
            <ReorderableList count={filters.length} labels={labels} empty={labels.noFilters} onMove={(from, to) => setFilters(moveItem(filters, from, to))}>
              {({ item }) =>
                filters.map((rule, index) => {
                  const column = byKey.get(rule.column)
                  const name = `${labels.filters} ${index + 1}`
                  const update = (next: FilterRule) => setFilters(replaceAt(filters, index, next))
                  const { column: key, ...condition } = rule
                  return item(
                    index,
                    index,
                    name,
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" data-filter-index={index}>
                      <ConditionFields
                        name={name}
                        column={column}
                        columns={columns}
                        columnKey={key}
                        condition={condition}
                        labels={labels}
                        onColumn={(next) => update({ column: next, ...withColumn(condition, byKey.get(next)) })}
                        onCondition={(next) => update({ column: key, ...next })}
                      />
                      <Count n={filterCounts ? (filterCounts[index] ?? 0) : null} template={labels.matches} />
                      <Problem text={ruleProblem(rule, columns)} />
                    </div>,
                    () => setFilters(removeAt(filters, index)),
                  )
                })
              }
            </ReorderableList>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setFilters([...filters, newFilter(columns)])}>
                {labels.addFilter}
              </Button>
              {shown && (
                <span className={cn("text-muted-foreground", NUMERIC_CLASS)} data-rules-shown={shown.n}>
                  {fill(labels.shown, shown)}
                </span>
              )}
            </div>
          </>
        )}

        {shownTab === "sort" && (
          <>
            <ReorderableList count={sorts.length} labels={labels} empty={labels.noSort} onMove={(from, to) => setSorts(moveItem(sorts, from, to))}>
              {({ item }) =>
                sorts.map((rule, index) => {
                  const name = `${labels.sort} ${index + 1}`
                  const update = (next: SortRule) => setSorts(replaceAt(sorts, index, next))
                  return item(
                    index,
                    index,
                    name,
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" data-sort-index={index}>
                      <span className={cn("w-4 text-right text-muted-foreground", NUMERIC_CLASS)} aria-hidden>
                        {index + 1}
                      </span>
                      <NativeSelect size="sm" value={rule.key} aria-label={`${labels.column}: ${name}`} data-rule-field="column" onChange={(event) => update({ ...rule, key: event.target.value })}>
                        {!byKey.has(rule.key) && <NativeSelectOption value={rule.key}>{rule.key}</NativeSelectOption>}
                        {columns.map((c) => (
                          <NativeSelectOption key={c.key} value={c.key}>
                            {columnName(c)}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <NativeSelect size="sm" value={rule.dir} aria-label={`${labels.direction}: ${name}`} data-rule-field="dir" onChange={(event) => update({ ...rule, dir: event.target.value === "desc" ? "desc" : "asc" })}>
                        <NativeSelectOption value="asc">{labels.asc}</NativeSelectOption>
                        <NativeSelectOption value="desc">{labels.desc}</NativeSelectOption>
                      </NativeSelect>
                      {!byKey.has(rule.key) && <Problem text={`No column is named "${rule.key}".`} />}
                    </div>,
                    () => setSorts(removeAt(sorts, index)),
                  )
                })
              }
            </ReorderableList>
            <Button type="button" variant="outline" size="sm" className="h-7 self-start px-2 text-xs" onClick={() => setSorts([...sorts, newSort(columns, sorts)])}>
              {labels.addSort}
            </Button>
          </>
        )}

        {shownTab === "columns" && hasColumns && <ColumnChooserPanel columns={columns} columnState={columnState} onColumnStateChange={onColumnStateChange} rules={highlights} />}
      </div>
      {shownTab !== "columns" && <p className="text-muted-foreground">{labels.dragHint}</p>}
    </div>
  )
}
