import { cn } from "cn"
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type Ref } from "react"
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
import type { ColumnDef } from "@/registry/tradecn/ui/data-grid"

// Callers own the sections and row markup. Items coordinate editing and reordering;
// the counts provider isolates feed updates from the editable fields.

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

export type RulesEditorKind = "highlights" | "filters" | "sort"

export interface RulesEditorProps<T> extends ComponentProps<"div"> {
  columns: ColumnDef<T>[]
  rules: GridRules
  onRulesChange: (rules: GridRules) => void
  /** Rows for independent match counts and the combined filter total. */
  store?: RowStore<T>
  labels?: Partial<RulesEditorLabels>
  children: ReactNode
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

export interface RulesEditorState {
  rules: GridRules
  labels: RulesEditorLabels
  columns: { key: string; name: string; ops: readonly RuleOp[] }[]
  problem: (rule: ColumnRule | FilterRule) => string | null
  change: (next: Partial<GridRules>) => void
  add: (kind: RulesEditorKind) => void
  move: (kind: RulesEditorKind, from: number, to: number) => void
  remove: (kind: RulesEditorKind, index: number) => void
}

const EditorContext = createContext<RulesEditorState | null>(null)

/** Read the controlled rules and edit operations for custom lists and controls. */
export function useRulesEditor(): RulesEditorState {
  const value = useContext(EditorContext)
  if (!value) throw new Error("RulesEditor parts must be inside RulesEditor")
  return value
}

interface Counts {
  highlights: number[] | null
  filters: number[] | null
  shown: { n: number; m: number } | null
}
const CountsContext = createContext<Counts>({ highlights: null, filters: null, shown: null })

// A feed notification updates only count consumers, even when the fields are not memoized.
function CountsProvider<T>({ store, columns, rules, children }: Pick<RulesEditorProps<T>, "store" | "columns" | "rules" | "children">) {
  const highlights = rules.columns ?? NO_HIGHLIGHTS
  const filters = rules.filter ?? NO_FILTERS
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns])
  const version = useThrottledVersion(store, 250)
  const highlightCounts = useMemo(() => {
    void version
    return store ? highlights.map((rule) => {
      const column = byKey.get(rule.column)
      return column ? countMatching(store, compileCondition(rule.when, column)) : 0
    }) : null
  }, [store, highlights, byKey, version])
  const filterCounts = useMemo(() => {
    void version
    return store ? filters.map((rule) => {
      const column = byKey.get(rule.column)
      return column ? countMatching(store, compileCondition(rule, column)) : 0
    }) : null
  }, [store, filters, byKey, version])
  const shown = useMemo(() => {
    void version
    return store ? { n: countMatching(store, compileFilter(filters, columns)), m: store.getIds().length } : null
  }, [store, filters, columns, version])
  return <CountsContext value={{ highlights: highlightCounts, filters: filterCounts, shown }}>{children}</CountsContext>
}

const LIST_KEY = { highlights: "columns", filters: "filter", sort: "sort" } as const
const DragContext = createContext<{ current: { kind: RulesEditorKind; index: number; type: string; clear: () => void } | null }>({ current: null })

// Controlled callers may copy the emitted rules. Compare their data only while a move or
// removal awaits focus restoration; property order and extra application fields do not matter.
function sameRuleList(left: readonly (ColumnRule | FilterRule | SortRule)[] | undefined, right: readonly (ColumnRule | FilterRule | SortRule)[]) {
  const fields = ["id", "column", "when", "op", "value", "values", "tone", "target", "label", "key", "dir"]
  return left === right || JSON.stringify(left, fields) === JSON.stringify(right, fields)
}

function assignEditorRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") return ref(node)
  if (ref) ref.current = node
}

function useEditorRef<T>(localRef: { current: T | null }, forwardedRef: Ref<T> | undefined) {
  return useCallback((node: T | null) => {
    localRef.current = node
    const cleanup = assignEditorRef(forwardedRef, node)
    return () => {
      localRef.current = null
      if (typeof cleanup === "function") cleanup()
      else assignEditorRef(forwardedRef, null)
    }
  }, [localRef, forwardedRef])
}

export function RulesEditor<T>({ columns, rules, onRulesChange, store, labels: labelsProp, children, className, ref, ...props }: RulesEditorProps<T>) {
  const labels = { ...DEFAULT_RULES_EDITOR_LABELS, ...labelsProp }
  const root = useRef<HTMLDivElement>(null)
  const rootRef = useEditorRef(root, ref)
  const dragging = useRef<{ kind: RulesEditorKind; index: number; type: string; clear: () => void } | null>(null)
  const focusAfter = useRef<{ rules: GridRules; kind: RulesEditorKind; index: number; list: readonly (ColumnRule | FilterRule | SortRule)[]; active: Element; field?: string } | null>(null)
  useLayoutEffect(() => {
    const pending = focusAfter.current
    if (!pending || pending.rules === rules) return
    focusAfter.current = null
    const list = rules[LIST_KEY[pending.kind]]
    if (list === pending.rules[LIST_KEY[pending.kind]] || !sameRuleList(list, pending.list)) return
    const active = root.current?.ownerDocument.activeElement
    if (active !== pending.active && active !== root.current?.ownerDocument.body) return
    const item = root.current?.querySelector<HTMLElement>(`[data-rule-kind="${pending.kind}"][data-rule-row="${pending.index}"]`)
    const field = pending.field ? item?.querySelector<HTMLElement>(`[data-rule-field="${pending.field}"]`) : null
    const target = field && !field.matches(":disabled") ? field : item ?? root.current?.querySelector<HTMLElement>(`[data-rules-add="${pending.kind}"]`)
    target?.focus()
  }, [rules])
  const rememberFocus = (kind: RulesEditorKind, index: number, list: readonly (ColumnRule | FilterRule | SortRule)[]) => {
    const active = root.current?.ownerDocument.activeElement
    if (!active || !root.current?.contains(active)) return
    focusAfter.current = { rules, kind, index, list, active, field: active.getAttribute("data-rule-field") ?? undefined }
  }
  const change = (next: Partial<GridRules>) => onRulesChange({ ...rules, ...next })
  const value: RulesEditorState = {
    rules,
    labels,
    columns: columns.map((column) => ({ key: column.key, name: columnName(column), ops: opsFor(column) })),
    problem: (rule) => ruleProblem(rule, columns),
    change,
    add: (kind) => {
      if (kind === "highlights") change({ columns: [...(rules.columns ?? NO_HIGHLIGHTS), newHighlight(columns)] })
      else if (kind === "filters") change({ filter: [...(rules.filter ?? NO_FILTERS), newFilter(columns)] })
      else change({ sort: [...(rules.sort ?? NO_SORTS), newSort(columns, rules.sort)] })
    },
    move: (kind, from, to) => {
      const key = LIST_KEY[kind]
      const list = rules[key] ?? []
      if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
      const next = moveItem<ColumnRule | FilterRule | SortRule>(list, from, to)
      rememberFocus(kind, to, next)
      // The key and list originate from the same kind; spread preserves the other lists.
      change({ [key]: next })
    },
    remove: (kind, index) => {
      const key = LIST_KEY[kind]
      const list = rules[key] ?? []
      if (index < 0 || index >= list.length) return
      const next = list.filter((_, i) => i !== index)
      rememberFocus(kind, Math.min(index, list.length - 2), next)
      change({ [key]: next })
    },
  }
  return (
    <EditorContext value={value}>
      <DragContext value={dragging}>
        <div role="region" aria-label={props["aria-labelledby"] ? undefined : labels.title} data-slot="tradecn-rules-editor" className={cn("flex min-w-0 flex-col gap-2 text-xs lining-nums tabular-nums", className)} {...props} ref={rootRef}>
          <CountsProvider store={store} columns={columns} rules={rules}>{children}</CountsProvider>
        </div>
      </DragContext>
    </EditorContext>
  )
}

type ActionProps = Omit<ComponentProps<typeof Button>, "children"> & { children: ReactNode }

export interface RulesEditorItemState {
  kind: RulesEditorKind
  index: number
  name: string
  columnKey: string
  condition: RuleCondition | null
  highlight: ColumnRule | null
  sort: SortRule | null
  problem: string | null
  setColumn: (key: string) => void
  setCondition: (condition: RuleCondition) => void
  updateHighlight: (patch: Partial<ColumnRule>) => void
  setDirection: (direction: "asc" | "desc") => void
}
const ItemContext = createContext<RulesEditorItemState | null>(null)
export function useRulesEditorItem(): RulesEditorItemState {
  const value = useContext(ItemContext)
  if (!value) throw new Error("Rule fields and actions must be inside RulesEditorItem")
  return value
}

export interface RulesEditorItemProps extends ComponentProps<"div"> {
  kind: RulesEditorKind
  index: number
  children: ReactNode
}
export function RulesEditorItem({ kind, index, className, onKeyDown, onDragStart, onDragOver, onDrop, onDragEnd, ...props }: RulesEditorItemProps) {
  const editor = useRulesEditor()
  const dragRef = useContext(DragContext)
  const dragType = `application/x-tradecn-rule-${useId()}`.toLowerCase()
  const [dragging, setDragging] = useState(false)
  useEffect(() => () => {
    if (dragRef.current?.type === dragType) dragRef.current = null
  }, [dragRef, dragType])
  const highlight = kind === "highlights" ? editor.rules.columns?.[index] : undefined
  const filter = kind === "filters" ? editor.rules.filter?.[index] : undefined
  const sort = kind === "sort" ? editor.rules.sort?.[index] : undefined
  const rule = highlight ?? filter ?? sort
  if (!rule) return null
  let columnKey = highlight?.column ?? sort?.key ?? ""
  let condition = highlight?.when ?? null
  if (filter) {
    const { column, ...rest } = filter
    columnKey = column
    condition = rest
  }
  const name = highlight?.label?.trim() || `${editor.labels[kind]} ${index + 1}`
  const replace = (next: ColumnRule | FilterRule | SortRule) => {
    const key = LIST_KEY[kind]
    editor.change({ [key]: editor.rules[key]?.map((item, i) => i === index ? next : item) })
  }
  const state: RulesEditorItemState = {
    kind, index, name, columnKey, condition, highlight: highlight ?? null, sort: sort ?? null,
    problem: highlight || filter ? editor.problem((highlight ?? filter)!) : editor.columns.some((c) => c.key === columnKey) ? null : `No column is named "${columnKey}".`,
    setColumn: (key) => {
      if (sort) return replace({ ...sort, key })
      const ops = editor.columns.find((c) => c.key === key)?.ops ?? opsFor(undefined)
      const next = ops.includes(condition!.op) ? condition! : { op: ops[0]! }
      replace(highlight ? { ...highlight, column: key, when: next } : { column: key, ...next })
    },
    setCondition: (next) => {
      if (highlight) replace({ ...highlight, when: next })
      else if (filter) replace({ column: columnKey, ...next })
    },
    updateHighlight: (patch) => { if (highlight) replace({ ...highlight, ...patch }) },
    setDirection: (dir) => { if (sort) replace({ ...sort, dir }) },
  }
  return <ItemContext value={state}><div role="group" tabIndex={0} draggable aria-label={props["aria-labelledby"] ? undefined : name} data-rule-kind={kind} data-rule-row={index} data-rule-id={highlight?.id} data-filter-index={filter ? index : undefined} data-sort-index={sort ? index : undefined} data-dragging={dragging || undefined} className={cn("flex min-w-0 flex-wrap items-center gap-1.5 rounded-sm border border-border/60 p-1.5 outline-none focus-visible:border-ring data-[dragging]:opacity-50", className)} {...props}
    onKeyDown={(event) => {
      onKeyDown?.(event)
      if (event.defaultPrevented || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return
      event.preventDefault()
      event.stopPropagation()
      editor.move(kind, index, index + (event.key === "ArrowUp" ? -1 : 1))
    }}
    onDragStart={(event) => {
      onDragStart?.(event)
      if (event.defaultPrevented) return
      dragRef.current = { kind, index, type: dragType, clear: () => setDragging(false) }
      event.dataTransfer?.setData?.("text/plain", String(index))
      event.dataTransfer?.setData?.(dragType, "")
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"
      setDragging(true)
    }}
    onDragOver={(event) => {
      onDragOver?.(event)
      if (event.defaultPrevented || dragRef.current?.kind !== kind || dragRef.current.index === index || !event.dataTransfer?.types.includes(dragRef.current.type)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
    }}
    onDrop={(event) => {
      onDrop?.(event)
      if (event.defaultPrevented || dragRef.current?.kind !== kind || !event.dataTransfer?.types.includes(dragRef.current.type)) return
      event.preventDefault()
      const from = dragRef.current.index
      dragRef.current.clear()
      dragRef.current = null
      editor.move(kind, from, index)
    }}
    onDragEnd={(event) => {
      onDragEnd?.(event)
      dragRef.current = null
      setDragging(false)
    }}
  /></ItemContext>
}

type SelectProps = Omit<ComponentProps<typeof NativeSelect>, "value" | "defaultValue" | "children">
export function RulesEditorColumn({ onChange, className, ...props }: SelectProps) {
  const { columns, labels } = useRulesEditor()
  const item = useRulesEditorItem()
  return <NativeSelect size="sm" aria-label={`${labels.column}: ${item.name}`} data-rule-field="column" className={cn("[&_select]:text-xs", className)} {...props} value={item.columnKey} onChange={(event) => {
    onChange?.(event)
    if (!event.defaultPrevented) item.setColumn(event.target.value)
  }}>
    {!columns.some((c) => c.key === item.columnKey) && <NativeSelectOption value={item.columnKey}>{item.columnKey}</NativeSelectOption>}
    {columns.map((c) => <NativeSelectOption key={c.key} value={c.key}>{c.name}</NativeSelectOption>)}
  </NativeSelect>
}

export function RulesEditorOperator({ onChange, className, ...props }: SelectProps) {
  const { columns, labels } = useRulesEditor()
  const item = useRulesEditorItem()
  if (!item.condition) return null
  const condition = item.condition
  const ops = columns.find((c) => c.key === item.columnKey)?.ops ?? opsFor(undefined)
  return <NativeSelect size="sm" aria-label={`${labels.condition}: ${item.name}`} data-rule-field="op" className={cn("[&_select]:text-xs", className)} {...props} value={condition.op} onChange={(event) => {
    onChange?.(event)
    if (!event.defaultPrevented) item.setCondition(withOp(condition, event.target.value as RuleOp))
  }}>{ops.map((op) => <NativeSelectOption key={op} value={op}>{RULE_OP_LABELS[op]}</NativeSelectOption>)}</NativeSelect>
}

type InputProps = Omit<ComponentProps<typeof Input>, "value" | "defaultValue">
export type RulesEditorValueProps = InputProps & { field?: "value" | "low" | "high" | "values" }
export function RulesEditorValue({ field = "value", ...props }: RulesEditorValueProps) {
  const { condition } = useRulesEditorItem()
  const shape = condition ? valueShape(condition.op) : "none"
  if (shape === "none" || (shape === "one" && field !== "value") || (shape === "two" && field !== "low" && field !== "high") || (shape === "many" && field !== "values")) return null
  return <ValueInput key={field} field={field} {...props} />
}

function ValueInput({ field, onChange, className, ...props }: InputProps & { field: NonNullable<RulesEditorValueProps["field"]> }) {
  const { labels } = useRulesEditor()
  const { condition, name, setCondition } = useRulesEditorItem()
  const values = condition!.values
  // Keep a trailing comma under the hand, but accept a different controlled value immediately.
  const [draft, setDraft] = useState(() => valuesText(values))
  const [known, setKnown] = useState(values)
  if (values !== known) {
    setKnown(values)
    if (valuesText(parseValues(draft)) !== valuesText(values)) setDraft(valuesText(values))
  }
  const value = field === "values" ? draft : field === "value" ? condition!.value : values?.[field === "low" ? 0 : 1]
  return <Input aria-label={`${labels[field]}: ${name}`} placeholder={labels[field]} spellCheck={false} autoComplete="off" data-rule-field={field} className={cn("h-6 px-1.5 text-xs md:text-xs", field === "values" ? "w-40" : field === "value" ? "w-28" : "w-24", className)} {...props} value={value == null ? "" : String(value)} onChange={(event) => {
    onChange?.(event)
    if (event.defaultPrevented) return
    const text = event.target.value
    if (field === "values") {
      setDraft(text)
      setCondition({ ...condition!, values: parseValues(text) })
    } else if (field === "value") setCondition({ ...condition!, value: text })
    else setCondition({ ...condition!, values: field === "low" ? [text, values?.[1] ?? ""] : [values?.[0] ?? "", text] })
  }} />
}

export function RulesEditorTone({ onChange, className, ...props }: SelectProps) {
  const { labels } = useRulesEditor()
  const { highlight, name, updateHighlight } = useRulesEditorItem()
  if (!highlight) return null
  return <NativeSelect size="sm" aria-label={`${labels.tone}: ${name}`} data-rule-field="tone" className={cn("[&_select]:text-xs", className)} {...props} value={highlight.tone} onChange={(event) => {
    onChange?.(event)
    if (!event.defaultPrevented) updateHighlight({ tone: event.target.value as RuleTone })
  }}>{RULE_TONES.map((tone) => <NativeSelectOption key={tone} value={tone}>{tone}</NativeSelectOption>)}</NativeSelect>
}

export function RulesEditorToneSwatch({ className, ...props }: ComponentProps<"span">) {
  const { highlight } = useRulesEditorItem()
  if (!highlight) return null
  return <span aria-hidden data-rule-swatch={highlight.tone} className={cn("rounded-sm px-1.5 py-0.5", RULE_TONE_CLASS[highlight.tone], className)} {...props}>{highlight.tone}</span>
}

export function RulesEditorTarget({ onChange, className, ...props }: SelectProps) {
  const { labels } = useRulesEditor()
  const { highlight, name, updateHighlight } = useRulesEditorItem()
  if (!highlight) return null
  return <NativeSelect size="sm" aria-label={`${labels.paints}: ${name}`} data-rule-field="target" className={cn("[&_select]:text-xs", className)} {...props} value={highlight.target ?? "cell"} onChange={(event) => {
    onChange?.(event)
    if (!event.defaultPrevented) updateHighlight({ target: event.target.value === "row" ? "row" : "cell" })
  }}><NativeSelectOption value="cell">{labels.cell}</NativeSelectOption><NativeSelectOption value="row">{labels.row}</NativeSelectOption></NativeSelect>
}

export function RulesEditorLabel({ onChange, className, ...props }: InputProps) {
  const { labels } = useRulesEditor()
  const { highlight, name, updateHighlight } = useRulesEditorItem()
  if (!highlight) return null
  return <Input aria-label={`${labels.label}: ${name}`} placeholder={labels.label} spellCheck={false} autoComplete="off" data-rule-field="label" className={cn("h-6 w-36 px-1.5 text-xs md:text-xs", className)} {...props} value={highlight.label ?? ""} onChange={(event) => {
    onChange?.(event)
    if (!event.defaultPrevented) updateHighlight({ label: event.target.value })
  }} />
}

export function RulesEditorDirection({ onChange, className, ...props }: SelectProps) {
  const { labels } = useRulesEditor()
  const { sort, name, setDirection } = useRulesEditorItem()
  if (!sort) return null
  return <NativeSelect size="sm" aria-label={`${labels.direction}: ${name}`} data-rule-field="dir" className={cn("[&_select]:text-xs", className)} {...props} value={sort.dir} onChange={(event) => {
    onChange?.(event)
    if (!event.defaultPrevented) setDirection(event.target.value === "desc" ? "desc" : "asc")
  }}><NativeSelectOption value="asc">{labels.asc}</NativeSelectOption><NativeSelectOption value="desc">{labels.desc}</NativeSelectOption></NativeSelect>
}

export function RulesEditorProblem({ className, ...props }: ComponentProps<"p">) {
  const { problem } = useRulesEditorItem()
  return problem ? <p data-rule-problem className={cn("basis-full text-destructive", className)} {...props}>{problem}</p> : null
}

export function RulesEditorMatchCount({ className, ...props }: ComponentProps<"span">) {
  const { kind, index } = useRulesEditorItem()
  const { labels } = useRulesEditor()
  const counts = useContext(CountsContext)
  const n = kind === "sort" ? null : counts[kind]?.[index] ?? null
  return n === null ? null : <span data-rule-count={n} className={cn("text-muted-foreground", NUMERIC_CLASS, className)} {...props}>{fill(labels.matches, { n })}</span>
}

export function RulesEditorFilterCount({ className, ...props }: ComponentProps<"span">) {
  const { labels } = useRulesEditor()
  const { shown } = useContext(CountsContext)
  return shown ? <span data-rules-shown={shown.n} className={cn("text-muted-foreground", NUMERIC_CLASS, className)} {...props}>{fill(labels.shown, shown)}</span> : null
}

export function RulesEditorRuleCount({ kind, className, ...props }: ComponentProps<"span"> & { kind: RulesEditorKind }) {
  const { rules } = useRulesEditor()
  const n = rules[LIST_KEY[kind]]?.length ?? 0
  return n ? <span className={cn("text-muted-foreground", NUMERIC_CLASS, className)} {...props}>{n}</span> : null
}

export type RulesEditorAddProps = ActionProps & { kind: RulesEditorKind }
export function RulesEditorAdd({ kind, onClick, className, ...props }: RulesEditorAddProps) {
  const { add } = useRulesEditor()
  return <Button type="button" variant="outline" size="sm" data-rules-add={kind} className={cn("h-7 self-start px-2 text-xs", className)} {...props} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) add(kind)
  }} />
}

export type RulesEditorMoveProps = ActionProps & { direction: "up" | "down" }
export function RulesEditorMove({ direction, disabled, onClick, className, ...props }: RulesEditorMoveProps) {
  const { rules, labels, move } = useRulesEditor()
  const { kind, index, name } = useRulesEditorItem()
  const end = direction === "up" ? index === 0 : index === (rules[LIST_KEY[kind]]?.length ?? 0) - 1
  return <Button type="button" variant="ghost" size="sm" aria-label={`${labels[direction === "up" ? "moveUp" : "moveDown"]}: ${name}`} data-rule-field={`move-${direction}`} className={cn("h-6 px-1.5 text-xs", className)} {...props} disabled={disabled || end} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) move(kind, index, index + (direction === "up" ? -1 : 1))
  }} />
}

export function RulesEditorRemove({ onClick, className, ...props }: ActionProps) {
  const { labels, remove } = useRulesEditor()
  const { kind, index, name } = useRulesEditorItem()
  return <Button type="button" variant="ghost" size="sm" aria-label={`${labels.remove}: ${name}`} data-rule-field="remove" className={cn("h-6 px-1.5 text-xs", className)} {...props} onClick={(event) => {
    onClick?.(event)
    if (!event.defaultPrevented) remove(kind, index)
  }} />
}
