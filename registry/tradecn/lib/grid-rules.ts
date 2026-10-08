// Rules as data for a grid: which cells to color, which rows to show, and the order, as plain objects
// a desk's support staff can write without a build, compiled here into the functions the grid runs.
//
// A rule names a column by its key and reads a row through that column's own accessor. A value typed
// into a rule is read in the column's own format through its `parse`, so a price rule on a 32nds
// column is written the way the column prints, "99-16+". Tones are token names, never a literal
// color, and an applied rule carries its meaning in a channel besides the color: `data-rule` names
// the rule on the element and the rule's words go in the element's accessible description (contract
// rule 15). Nothing here decides a value; it only compares what the row says with what the rule says.

export type RuleOp = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "between" | "in" | "contains" | "startsWith" | "isNull" | "notNull"

/** What a rule compares against, as typed. A string is read in the column's format; a number or boolean is used as it is. */
export type RuleValue = string | number | boolean | null

/** A token name. The soft variant tints the background; the token itself colors the text. */
export type RuleTone = "up" | "down" | "flat" | "stale" | "expiring" | "primary" | "destructive"

export interface RuleCondition {
  op: RuleOp
  /** For eq, ne, gt, gte, lt, lte, contains, and startsWith. */
  value?: RuleValue
  /** For between (two: low, then high, both inclusive) and in (any number). Each is read as `value` is. */
  values?: RuleValue[]
}

export interface ColumnRule {
  id: string
  /** The column whose value the rule reads, by key. */
  column: string
  when: RuleCondition
  tone: RuleTone
  /** The rule in words: the accessible description of what it paints. `describeRule` writes one when it is left out. */
  label?: string
  /** What the tone paints: the cell in `column` (default), or the whole row. */
  target?: "cell" | "row"
}

export interface FilterRule extends RuleCondition {
  column: string
}

export interface SortRule {
  key: string
  dir: "asc" | "desc"
}

export interface GridRules {
  /** Cells and rows to color. The first rule in the list that matches a cell decides it. */
  columns?: ColumnRule[]
  /** Every rule has to hold for a row to show. */
  filter?: FilterRule[]
  /** The first rule that tells two rows apart decides their order. */
  sort?: SortRule[]
}

// The types above are rules as you write them. Rules read from saved data are looser: any field can be missing,
// and an op or a tone can be text this version doesn't know, for `ruleProblem` to name. The readers return these,
// and every helper, the grid, and the editor take them, so code that reads a rule's fields checks them first.

/** A condition as read from saved data: its op can be missing or unknown text. */
export interface ReadCondition extends Omit<RuleCondition, "op"> {
  op?: string
}

/** A highlight as read from saved data: any field can be missing, and its tone can be unknown text. */
export interface ReadColumnRule extends Omit<ColumnRule, "id" | "column" | "when" | "tone"> {
  id?: string
  column?: string
  when?: ReadCondition
  tone?: string
}

/** A filter rule as read from saved data: its column and op can be missing, and its op unknown text. */
export interface ReadFilterRule extends ReadCondition {
  column?: string
}

/** A sort key as read from saved data: its key can be missing. */
export interface ReadSortRule extends Omit<SortRule, "key"> {
  key?: string
}

/** Rules as read from saved data. A set of rules you wrote is one of these too. */
export interface ReadGridRules {
  columns?: ReadColumnRule[]
  filter?: ReadFilterRule[]
  sort?: ReadSortRule[]
}

/** Which list a rule comes from, for the helpers that judge or describe one rule. */
export type RuleKind = "highlight" | "filter"

/** What a rule needs of a column. The grid's `ColumnDef` satisfies it. */
export interface RuleColumn<T> {
  key: string
  /** Named in a rule's words when it is a string; the key otherwise. */
  header?: unknown
  accessor: (row: T) => unknown
  numeric?: boolean
  /** Reads a value typed into a rule in this column's own format. Default: a number for a numeric column, the text itself for the rest. */
  parse?: (text: string) => unknown
  /** Prints a parsed rule value in the rule's words, so a description says what the rule compares — a data-grid column's `format` fits when it reads only the value, since no row exists here. */
  format?: (value: unknown, ...rest: never[]) => string
}

export const RULE_OPS: readonly RuleOp[] = ["eq", "ne", "gt", "gte", "lt", "lte", "between", "in", "contains", "startsWith", "isNull", "notNull"]
export const NUMBER_OPS: readonly RuleOp[] = ["eq", "ne", "gt", "gte", "lt", "lte", "between", "in", "isNull", "notNull"]
export const TEXT_OPS: readonly RuleOp[] = ["eq", "ne", "contains", "startsWith", "in", "isNull", "notNull"]

/** The word for each op, as a rule reads aloud: "Price above 99-16+". */
export const RULE_OP_LABELS: Record<RuleOp, string> = {
  eq: "is",
  ne: "is not",
  gt: "above",
  gte: "at or above",
  lt: "below",
  lte: "at or below",
  between: "between",
  in: "one of",
  contains: "contains",
  startsWith: "starts with",
  isNull: "is empty",
  notNull: "is not empty",
}

export const RULE_TONES: readonly RuleTone[] = ["up", "down", "flat", "stale", "expiring", "primary", "destructive"]

// A tone is a tint of the token's soft variant, painted as a background image rather than a background
// color so it layers over whatever color the element already has: a frozen cell keeps its opaque
// `bg-background` under the tint and stays opaque as rows scroll beneath it. Text on the tint is the
// foreground, and up, down, and flat text inside takes the foreground too: a direction color on a tint
// drops below 4.5 to 1 in the light themes, and a signed value still says its direction by its sign.
const ON_TINT = "text-foreground [&_.text-up]:text-inherit [&_.text-down]:text-inherit [&_.text-flat]:text-inherit"
export const RULE_TONE_CLASS: Record<RuleTone, string> = {
  up: `${ON_TINT} bg-[linear-gradient(var(--up-soft),var(--up-soft))]`,
  down: `${ON_TINT} bg-[linear-gradient(var(--down-soft),var(--down-soft))]`,
  flat: `${ON_TINT} bg-[linear-gradient(var(--flat-soft),var(--flat-soft))]`,
  stale: `${ON_TINT} bg-[linear-gradient(var(--stale-soft),var(--stale-soft))]`,
  expiring: `${ON_TINT} bg-[linear-gradient(var(--expiring-soft),var(--expiring-soft))]`,
  primary: `${ON_TINT} bg-[linear-gradient(color-mix(in_oklab,var(--primary)_12%,transparent),color-mix(in_oklab,var(--primary)_12%,transparent))]`,
  destructive: `${ON_TINT} bg-[linear-gradient(color-mix(in_oklab,var(--destructive)_12%,transparent),color-mix(in_oklab,var(--destructive)_12%,transparent))]`,
}

/** What an applied rule puts on a cell or a row. */
export interface RuleDecoration {
  "data-rule": string
  /** The rule's tone as text, absent when the rule has none: one outside RULE_TONES paints nothing. */
  "data-tone"?: string
  "aria-description": string
  className: string
}

/** The ops a column offers: comparisons and ranges for a numeric column, text matching for the rest. */
export function opsFor(column: { numeric?: boolean } | undefined): readonly RuleOp[] {
  return column?.numeric ? NUMBER_OPS : TEXT_OPS
}

/** The column's name in words: its header when that is a string, else its key. */
export function columnName<T>(column: RuleColumn<T> | undefined, key?: string): string {
  if (column && typeof column.header === "string" && column.header.trim()) return column.header
  return column?.key ?? textOf(key) ?? ""
}

/** Null for null, undefined, NaN, and the infinities; the value otherwise. */
export function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === "number" && !Number.isFinite(value)) return null
  return value
}

/** Nulls last, numbers numerically, everything else as text. */
export function compareValues(a: unknown, b: unknown): number {
  const an = normalizeValue(a) === null
  const bn = normalizeValue(b) === null
  if (an && bn) return 0
  if (an) return 1
  if (bn) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b))
}

/** `compareValues` in a direction, with a null last whichever way the list runs: a missing price never leads a list sorted high to low. */
export function compareDirected(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  const an = normalizeValue(a) === null
  const bn = normalizeValue(b) === null
  if (an || bn) return compareValues(a, b)
  const c = compareValues(a, b)
  return dir === "desc" ? -c : c
}

/**
 * A value as typed into a rule, read for a column: a string goes through the column's `parse`, or
 * `Number` for a numeric column, and stays text otherwise; a number or boolean is used as it is.
 * Null when there is nothing to read, and null never matches anything but `isNull`.
 */
export function readRuleValue<T>(column: RuleColumn<T> | undefined, raw: RuleValue | undefined): unknown {
  if (raw === undefined || raw === null) return null
  if (typeof raw === "number" || typeof raw === "boolean") return normalizeValue(raw)
  // Anything else that is not text (an object or a list in a rule's JSON) has nothing to read.
  if (typeof raw !== "string") return null
  if (column?.parse) return normalizeValue(column.parse(raw))
  if (column?.numeric) {
    const text = raw.trim().replace(/−/g, "-").replace(/,/g, "")
    return text === "" ? null : normalizeValue(Number(text))
  }
  return raw
}

function same(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase()
  if (typeof a === "number" && typeof b === "string") return a === Number(b)
  if (typeof a === "string" && typeof b === "number") return Number(a) === b
  return a === b
}

const needsValue = new Set<RuleOp>(["eq", "ne", "gt", "gte", "lt", "lte", "contains", "startsWith"])

/** True for an op this module compares with. Other text, inherited names such as `toString` included, is not one. */
function isRuleOp(op: unknown): op is RuleOp {
  return typeof op === "string" && (RULE_OPS as readonly string[]).includes(op)
}

/** True for a tone this module paints with. */
function isRuleTone(tone: unknown): tone is RuleTone {
  return typeof tone === "string" && (RULE_TONES as readonly string[]).includes(tone)
}

function isCondition(condition: unknown): condition is RuleCondition {
  return typeof condition === "object" && condition !== null && isRuleOp((condition as RuleCondition).op)
}

// A value that is not text is quoted as its JSON, so an object in a rule reads as `{}`, not [object Object]. One JSON
// cannot print reads through `String`, so a bigint prints its digits, and by its tag when even that throws (an object
// whose own `toString` is not a function), so this never throws.
function shown(raw: unknown): string {
  if (typeof raw === "string") return raw
  if (typeof raw === "number") return String(raw)
  try {
    return JSON.stringify(raw) ?? String(raw)
  } catch {
    try {
      return String(raw)
    } catch {
      return Object.prototype.toString.call(raw)
    }
  }
}

// A name or a word from saved data: text as it is, anything else as its JSON, nothing for null or undefined.
const textOf = (value: unknown): string | undefined => (value === undefined || value === null ? undefined : shown(value))

// A value to compare with: text, a number, a boolean, or null as they are; anything else as its JSON text, so the
// value the editor shows is the value compared and `ruleProblem` can name it.
const valueOf = (value: unknown): RuleValue | undefined =>
  value === undefined ? undefined : value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : shown(value)

// An object that is not a list: what a rule, a condition, or a set of rules is saved as.
const isEntry = (value: unknown): value is object => typeof value === "object" && value !== null && !Array.isArray(value)

// The saved object with the fields this module reads replaced by their readings, or removed when a reading is
// nothing. Every other field an app keeps on a rule (an owner, a flag, an id on a filter) passes through, so an edit
// made from a read rule never loses it.
function keep<R>(saved: Record<string, unknown>, read: Record<string, unknown>): R {
  const rule: Record<string, unknown> = { ...saved }
  for (const [key, value] of Object.entries(read)) {
    if (value === undefined) delete rule[key]
    else rule[key] = value
  }
  return rule as R
}

/**
 * A condition as a desk saved it, read: its op as text (one this module does not know stays as its text, for
 * `ruleProblem` to name), its value as `valueOf` reads it, and its values only from a list; any other field passes
 * through. Undefined when the condition is not an object.
 */
export function readCondition(value: unknown): ReadCondition | undefined {
  if (!isEntry(value)) return undefined
  const saved = value as Record<string, unknown>
  return keep<ReadCondition>(saved, {
    op: textOf(saved.op),
    value: valueOf(saved.value),
    values: Array.isArray(saved.values) ? saved.values.flatMap((item) => (item === undefined ? [] : [valueOf(item)!])) : undefined,
  })
}

/**
 * A highlight as a desk saved it, read: names and words as text, its condition read, a label only when it is text,
 * and the row as its target only when it says so; a field it reads to nothing is left out, and any other field
 * passes through. Null when it is not an object.
 */
export function readColumnRule(value: unknown): ReadColumnRule | null {
  if (!isEntry(value)) return null
  const saved = value as Record<string, unknown>
  return keep<ReadColumnRule>(saved, {
    id: textOf(saved.id),
    column: textOf(saved.column),
    when: readCondition(saved.when),
    tone: textOf(saved.tone),
    label: typeof saved.label === "string" ? saved.label : undefined,
    target: saved.target === "row" || saved.target === "cell" ? saved.target : undefined,
  })
}

/** A filter rule as a desk saved it, read as a condition on its column; any other field passes through. Null when it is not an object. */
export function readFilterRule(value: unknown): ReadFilterRule | null {
  if (!isEntry(value)) return null
  return keep<ReadFilterRule>(readCondition(value) as unknown as Record<string, unknown>, { column: textOf((value as Record<string, unknown>).column) })
}

/** A sort key as a desk saved it, read: its key as text, descending only when it says so; any other field passes through. Null when it is not an object. */
export function readSortRule(value: unknown): ReadSortRule | null {
  if (!isEntry(value)) return null
  const saved = value as Record<string, unknown>
  return keep<ReadSortRule>(saved, { key: textOf(saved.key), dir: saved.dir === "desc" ? "desc" : "asc" })
}

/**
 * Rules a desk saved or shared, read into the shape the grid and the editor take: a list that is not a list is
 * left out, an entry that is not an object is dropped, and each rule is read as `readColumnRule`, `readFilterRule`,
 * and `readSortRule` read it; any other field passes through. Nothing is decided here: a rule that cannot apply
 * still reads, for `ruleProblem` to name.
 */
export function readRules(value: unknown): ReadGridRules {
  if (!isEntry(value)) return {}
  const saved = value as Record<string, unknown>
  const list = <R,>(items: unknown, read: (item: unknown) => R | null): R[] | undefined =>
    Array.isArray(items) ? items.flatMap((item) => { const rule = read(item); return rule ? [rule] : [] }) : undefined
  return keep<ReadGridRules>(saved, { columns: list(saved.columns, readColumnRule), filter: list(saved.filter, readFilterRule), sort: list(saved.sort, readSortRule) })
}

// A highlight carries its condition in `when` and has a tone; a filter rule carries its condition flat and has no tone.
const isHighlightShape = (rule: object) => "when" in rule || "tone" in rule

// A list that is not a list reads as none.
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [])

// A list of values that is not a list reads as none.
const valuesOf = (condition: { values?: unknown }): readonly RuleValue[] => (Array.isArray(condition.values) ? condition.values : [])

/**
 * One condition compiled against one column: the typed values are read once, and the function that
 * comes back only compares. A row whose value is null answers only `isNull` and `notNull`. Rules are
 * data a desk edits, so a condition that is missing or names no op this module knows matches nothing
 * rather than throwing, as do `in` and `between` when their `values` are not a list; `ruleProblem` says
 * what is wrong with it.
 */
export function compileCondition<T>(saved: ReadCondition | undefined, column: RuleColumn<T>): (row: T) => boolean {
  const condition = readCondition(saved)
  if (!isCondition(condition)) return () => false
  const { op } = condition
  const want = readRuleValue(column, condition.value)
  const list = valuesOf(condition).map((v) => readRuleValue(column, v)).filter((v) => v !== null)
  const read = (row: T) => normalizeValue(column.accessor(row))
  switch (op) {
    case "isNull":
      return (row) => read(row) === null
    case "notNull":
      return (row) => read(row) !== null
    case "eq":
      return want === null ? () => false : (row) => same(read(row), want)
    case "ne":
      return want === null
        ? () => false
        : (row) => {
            const v = read(row)
            return v !== null && !same(v, want)
          }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (want === null) return () => false
      return (row) => {
        const v = read(row)
        if (v === null) return false
        const c = compareValues(v, want)
        return op === "gt" ? c > 0 : op === "gte" ? c >= 0 : op === "lt" ? c < 0 : c <= 0
      }
    }
    case "between": {
      const [lo, hi] = list
      if (lo === undefined || hi === undefined) return () => false
      return (row) => {
        const v = read(row)
        return v !== null && compareValues(v, lo) >= 0 && compareValues(v, hi) <= 0
      }
    }
    case "in":
      return list.length === 0 ? () => false : (row) => list.some((item) => same(read(row), item))
    case "contains":
    case "startsWith": {
      if (want === null) return () => false
      const needle = String(want).toLowerCase()
      return (row) => {
        const v = read(row)
        if (v === null) return false
        const text = String(v).toLowerCase()
        return op === "contains" ? text.includes(needle) : text.startsWith(needle)
      }
    }
  }
}

function findColumn<T>(columns: readonly RuleColumn<T>[], key: string | undefined): RuleColumn<T> | undefined {
  return key === undefined ? undefined : columns.find((column) => column.key === key)
}


/**
 * Why a rule cannot apply, in a sentence, or null when it can: a column the grid does not have, a
 * value the column cannot read, a range without its two ends, a set with nothing in it, a missing or
 * unknown comparison or tone. `kind` says which list the rule is in; without it, a `when` or a `tone`
 * key makes the rule a highlight.
 */
export function ruleProblem<T>(rule: ReadColumnRule & ReadFilterRule, columns: readonly RuleColumn<T>[], kind?: RuleKind): string | null {
  if (typeof rule !== "object" || rule === null) return "The rule needs a column."
  const named = textOf(rule.column)
  if (named === undefined) return "The rule needs a column."
  const column = findColumn(columns, named)
  if (!column) return `No column is named "${named}".`
  const highlight = kind ? kind === "highlight" : isHighlightShape(rule)
  // The condition as the grid reads it: one saved as anything but an object that is not a list is none.
  const read = readCondition(highlight ? rule.when : rule)
  const op = read?.op
  if (op === undefined || op === "") return "The rule needs a comparison."
  if (!isRuleOp(op)) return `No comparison is named "${op}".`
  // The op is one this module knows, from here on.
  const condition = read as RuleCondition
  const name = columnName(column)
  const unreadable = (raw: RuleValue | undefined) => raw !== undefined && raw !== null && raw !== "" && readRuleValue(column, raw) === null
  if (needsValue.has(condition.op)) {
    if (condition.value === undefined || condition.value === null || condition.value === "") return `${RULE_OP_LABELS[condition.op]} needs a value.`
    if (unreadable(condition.value)) return `"${shown(condition.value)}" is not a value ${name} reads.`
  }
  if (condition.op === "between") {
    const values = valuesOf(condition)
    if (values.length !== 2) return "between needs a low value and a high value."
    for (const raw of values) if (unreadable(raw) || raw === "" || raw === null) return `"${raw === null ? "" : shown(raw)}" is not a value ${name} reads.`
    if (compareValues(readRuleValue(column, values[0]), readRuleValue(column, values[1])) > 0) return "between needs a low value at or below the high value."
  }
  if (condition.op === "in") {
    const values = valuesOf(condition).filter((raw) => raw !== null && raw !== "")
    if (!values.length) return "one of needs at least one value."
    for (const raw of values) if (unreadable(raw)) return `"${shown(raw)}" is not a value ${name} reads.`
  }
  // A highlight named as one always needs a tone; one only inferred from its keys is judged by the tone it carries.
  const tone = textOf(rule.tone)
  if (highlight && (kind || "tone" in rule) && !isRuleTone(tone)) return tone === undefined || tone === "" ? "The rule needs a tone." : `No tone is named "${tone}".`
  return null
}

/** The rule in words: "Price above 99-16+", "Client one of ALPHA, BETA", "Status is empty". `kind` reads as for `ruleProblem`. */
export function describeRule<T>(rule: ReadColumnRule & ReadFilterRule, columns: readonly RuleColumn<T>[], kind?: RuleKind): string {
  if (typeof rule !== "object" || rule === null) return ""
  const column = findColumn(columns, textOf(rule.column))
  const highlight = kind ? kind === "highlight" : isHighlightShape(rule)
  const condition: Partial<ReadCondition> = readCondition(highlight ? rule.when : rule) ?? {}
  const name = columnName(column, rule.column)
  const word = isRuleOp(condition.op) ? RULE_OP_LABELS[condition.op] : (condition.op ?? "")
  // A string threshold reads through the column's parse, so the words print what the rule
  // compares: a decimal typed into a fraction column describes, as it matches, on the grid.
  const text = (raw: RuleValue | undefined) => {
    if (raw === undefined || raw === null) return ""
    if (typeof raw === "string" && column?.parse && column.format) {
      // Normalized like the comparison: a parser's NaN matches nothing, so its words must not
      // print a formatted non-value. A parser's throw propagates here as it does everywhere.
      const parsed = normalizeValue(column.parse(raw))
      if (parsed !== null && parsed !== undefined) {
        try {
          const printed = column.format(parsed)
          if (typeof printed === "string" && printed !== "") return printed
        } catch {
          // A format that needs its row has no row here; the typed text stands.
        }
      }
    }
    return shown(raw)
  }
  if (condition.op === "isNull" || condition.op === "notNull") return `${name} ${word}`
  if (condition.op === "between") {
    const [lo, hi] = valuesOf(condition)
    return `${name} ${word} ${text(lo)} and ${text(hi)}`
  }
  if (condition.op === "in") return `${name} ${word} ${valuesOf(condition).map(text).join(", ")}`
  return `${name} ${word} ${text(condition.value)}`.trim()
}

/** Every rule has to hold. A rule on a column the grid does not have is skipped, so a stale rule hides nothing. */
export function compileFilter<T>(rules: readonly ReadFilterRule[], columns: readonly RuleColumn<T>[]): (row: T) => boolean {
  const tests: ((row: T) => boolean)[] = []
  for (const entry of listOf(rules)) {
    const rule = readFilterRule(entry)
    const column = rule ? findColumn(columns, rule.column) : undefined
    if (rule && column) tests.push(compileCondition(rule, column))
  }
  if (!tests.length) return () => true
  if (tests.length === 1) return tests[0]!
  return (row) => tests.every((test) => test(row))
}

/** The first rule that tells two rows apart decides, nulls last either way. Undefined when no rule names a column the grid has. */
export function compileComparator<T>(rules: readonly ReadSortRule[], columns: readonly RuleColumn<T>[]): ((a: T, b: T) => number) | undefined {
  const keys: { accessor: (row: T) => unknown; dir: "asc" | "desc" }[] = []
  for (const entry of listOf(rules)) {
    const rule = readSortRule(entry)
    const column = rule ? findColumn(columns, rule.key) : undefined
    if (rule && column) keys.push({ accessor: column.accessor, dir: rule.dir })
  }
  if (!keys.length) return undefined
  return (a, b) => {
    for (const { accessor, dir } of keys) {
      const c = compareDirected(accessor(a), accessor(b), dir)
      if (c !== 0) return c
    }
    return 0
  }
}

/** The decoration a matched rule puts on its cell or row. */
export function ruleDecoration<T>(saved: ReadColumnRule, columns: readonly RuleColumn<T>[]): RuleDecoration {
  const rule = readColumnRule(saved) ?? {}
  return {
    "data-rule": rule.id ?? "",
    "data-tone": rule.tone,
    "aria-description": (typeof rule.label === "string" ? rule.label.trim() : "") || describeRule(rule, columns, "highlight"),
    className: isRuleTone(rule.tone) ? RULE_TONE_CLASS[rule.tone] : "",
  }
}

export interface AppliedRules<T> {
  /** The first cell rule on this column that the row matches, or undefined. */
  cell: (columnKey: string, row: T) => RuleDecoration | undefined
  /** The first row rule the row matches, or undefined. Shaped for the grid's `getRowProps`. */
  getRowProps: (row: T) => RuleDecoration | undefined
  /** The rules that name a column the grid has, by column key, in the order they apply. */
  byColumn: ReadonlyMap<string, readonly ReadColumnRule[]>
}

/**
 * Column rules compiled once: each against its column, its decoration made ahead of time, and the
 * grid's two hooks, `cell` and `getRowProps`, answering per row with a matched rule's decoration. A
 * rule naming a column the grid does not have is skipped.
 */
export function applyRules<T>(rules: readonly ReadColumnRule[], columns: readonly RuleColumn<T>[]): AppliedRules<T> {
  const cells = new Map<string, { test: (row: T) => boolean; decoration: RuleDecoration }[]>()
  const rows: { test: (row: T) => boolean; decoration: RuleDecoration }[] = []
  const byColumn = new Map<string, ReadColumnRule[]>()
  for (const entry of listOf(rules)) {
    const rule = readColumnRule(entry)
    const column = rule ? findColumn(columns, rule.column) : undefined
    if (!rule || !column) continue
    const compiled = { test: compileCondition(rule.when, column), decoration: ruleDecoration(rule, columns) }
    byColumn.set(column.key, [...(byColumn.get(column.key) ?? []), rule])
    if (rule.target === "row") rows.push(compiled)
    else cells.set(column.key, [...(cells.get(column.key) ?? []), compiled])
  }
  return {
    cell(columnKey, row) {
      const list = cells.get(columnKey)
      if (!list) return undefined
      for (const { test, decoration } of list) if (test(row)) return decoration
      return undefined
    },
    getRowProps(row) {
      for (const { test, decoration } of rows) if (test(row)) return decoration
      return undefined
    },
    byColumn,
  }
}
