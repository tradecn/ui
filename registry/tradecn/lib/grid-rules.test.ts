import { describe, expect, it } from "vitest"
import { parsePrice } from "@/registry/tradecn/lib/format"
import {
  NUMBER_OPS,
  RULE_OPS,
  RULE_OP_LABELS,
  RULE_TONES,
  RULE_TONE_CLASS,
  TEXT_OPS,
  applyRules,
  columnName,
  compareDirected,
  compareValues,
  compileComparator,
  compileCondition,
  compileFilter,
  describeRule,
  normalizeValue,
  opsFor,
  readRuleValue,
  ruleDecoration,
  ruleProblem,
  type ColumnRule,
  type RuleColumn,
} from "@/registry/tradecn/lib/grid-rules"

interface Rfq {
  id: string
  client: string
  size: number
  px: number | null
  status: string
  auto?: boolean
}

const THIRTY_SECONDS = { kind: "fraction", denominator: 32, half: "+" } as const

const columns: RuleColumn<Rfq>[] = [
  { key: "client", header: "Client", accessor: (r) => r.client },
  { key: "size", header: "Size", numeric: true, accessor: (r) => r.size },
  { key: "px", header: "Price", numeric: true, accessor: (r) => r.px, parse: (text) => parsePrice(text, THIRTY_SECONDS) },
  { key: "status", header: "Status", accessor: (r) => r.status },
  { key: "auto", header: "Auto", accessor: (r) => Boolean(r.auto), parse: (text) => text.trim().toLowerCase() === "yes" },
]

const rows: Rfq[] = [
  { id: "a", client: "ALPHA", size: 5_000_000, px: 99.5, status: "Open" },
  { id: "b", client: "Beta", size: 25_000_000, px: 99.515625, status: "Quoted", auto: true },
  { id: "c", client: "GAMMA", size: 2_000_000, px: null, status: "Open" },
  { id: "d", client: "delta", size: 10_000_000, px: 100.25, status: "Done away" },
]

const byId = (list: Rfq[]) => list.map((r) => r.id)

describe("reading a typed value", () => {
  it("reads a string through the column's parse, as a number for a numeric column, and as text for the rest", () => {
    expect(readRuleValue(columns[2], "99-16+")).toBe(99.515625)
    expect(readRuleValue(columns[1], "5,000,000")).toBe(5_000_000)
    expect(readRuleValue(columns[1], "−3")).toBe(-3)
    expect(readRuleValue(columns[0], "alpha")).toBe("alpha")
    expect(readRuleValue(columns[4], "yes")).toBe(true)
  })

  it("keeps a number or a boolean as given, and reads nothing to null", () => {
    expect(readRuleValue(columns[1], 5)).toBe(5)
    expect(readRuleValue(columns[4], false)).toBe(false)
    expect(readRuleValue(columns[1], "")).toBeNull()
    expect(readRuleValue(columns[1], "abc")).toBeNull()
    expect(readRuleValue(columns[2], "99-99")).toBeNull()
    expect(readRuleValue(columns[1], undefined)).toBeNull()
    expect(readRuleValue(columns[1], null)).toBeNull()
  })

  it("normalizes the values that are not values", () => {
    expect(normalizeValue(NaN)).toBeNull()
    expect(normalizeValue(Infinity)).toBeNull()
    expect(normalizeValue(undefined)).toBeNull()
    expect(normalizeValue(0)).toBe(0)
    expect(normalizeValue("")).toBe("")
  })

  it("compares nulls last, numbers numerically, and the rest as text", () => {
    expect(compareValues(2, 10)).toBeLessThan(0)
    expect(compareValues("b", "a")).toBeGreaterThan(0)
    expect(compareValues(null, 1)).toBeGreaterThan(0)
    expect(compareValues(1, NaN)).toBeLessThan(0)
    expect(compareValues(null, undefined)).toBe(0)
    // In a direction, a null still sorts last: high to low never leads with a missing value.
    expect(compareDirected(2, 10, "desc")).toBeGreaterThan(0)
    expect(compareDirected(null, 10, "desc")).toBeGreaterThan(0)
    expect(compareDirected(10, null, "asc")).toBeLessThan(0)
  })
})

describe("compileCondition", () => {
  const test = (op: ColumnRule["when"]["op"], column: RuleColumn<Rfq>, value?: string | number | boolean, values?: (string | number)[]) => byId(rows.filter(compileCondition({ op, value, values }, column)))

  it("compares a price typed in the column's own notation", () => {
    expect(test("gt", columns[2]!, "99-16")).toEqual(["b", "d"])
    expect(test("gte", columns[2]!, "99-16+")).toEqual(["b", "d"])
    expect(test("lt", columns[2]!, "99-16+")).toEqual(["a"])
    expect(test("lte", columns[2]!, "99-16+")).toEqual(["a", "b"])
    expect(test("eq", columns[2]!, "99-16+")).toEqual(["b"])
    expect(test("between", columns[2]!, undefined, ["99-16", "100-00"])).toEqual(["a", "b"])
  })

  it("matches text without regard to case", () => {
    expect(test("eq", columns[0]!, "alpha")).toEqual(["a"])
    expect(test("ne", columns[0]!, "alpha")).toEqual(["b", "c", "d"])
    expect(test("contains", columns[0]!, "ETA")).toEqual(["b"])
    expect(test("startsWith", columns[0]!, "d")).toEqual(["d"])
    expect(test("in", columns[0]!, undefined, ["Alpha", "GAMMA"])).toEqual(["a", "c"])
  })

  it("reads a number given as a number, and a size as typed with its commas", () => {
    expect(test("gte", columns[1]!, 10_000_000)).toEqual(["b", "d"])
    expect(test("in", columns[1]!, undefined, ["5,000,000", 2_000_000])).toEqual(["a", "c"])
    expect(test("between", columns[1]!, undefined, [2_000_000, 5_000_000])).toEqual(["a", "c"])
  })

  it("lets a null answer only isNull and notNull", () => {
    expect(test("isNull", columns[2]!)).toEqual(["c"])
    expect(test("notNull", columns[2]!)).toEqual(["a", "b", "d"])
    expect(test("ne", columns[2]!, "99-16+")).toEqual(["a", "d"])
    expect(test("lt", columns[2]!, "200-00")).toEqual(["a", "b", "d"])
  })

  it("matches nothing when the typed value cannot be read, or a range or set is incomplete", () => {
    expect(test("gt", columns[2]!, "abc")).toEqual([])
    expect(test("eq", columns[1]!, "")).toEqual([])
    expect(test("between", columns[1]!, undefined, [1])).toEqual([])
    expect(test("in", columns[1]!, undefined, [])).toEqual([])
  })

  it("reads a boolean column through its parse", () => {
    expect(test("eq", columns[4]!, "yes")).toEqual(["b"])
    expect(test("eq", columns[4]!, true)).toEqual(["b"])
    expect(test("ne", columns[4]!, "yes")).toEqual(["a", "c", "d"])
  })
})

describe("compileFilter and compileComparator", () => {
  it("requires every filter rule, and skips one on a column the grid does not have", () => {
    const filter = compileFilter(
      [
        { column: "status", op: "eq", value: "open" },
        { column: "size", op: "gte", value: "5,000,000" },
        { column: "nothing", op: "eq", value: "x" },
      ],
      columns,
    )
    expect(byId(rows.filter(filter))).toEqual(["a"])
    expect(byId(rows.filter(compileFilter([], columns)))).toEqual(["a", "b", "c", "d"])
    expect(byId(rows.filter(compileFilter([{ column: "nothing", op: "isNull" }], columns)))).toEqual(["a", "b", "c", "d"])
  })

  it("orders by the first rule that tells two rows apart, nulls last either way", () => {
    const byStatusThenSize = compileComparator(
      [
        { key: "status", dir: "asc" },
        { key: "size", dir: "desc" },
      ],
      columns,
    )!
    expect(byId([...rows].sort(byStatusThenSize))).toEqual(["d", "a", "c", "b"])
    const byPrice = compileComparator([{ key: "px", dir: "desc" }], columns)!
    expect(byId([...rows].sort(byPrice))).toEqual(["d", "b", "a", "c"])
    expect(compileComparator([{ key: "nothing", dir: "asc" }], columns)).toBeUndefined()
    expect(compileComparator([], columns)).toBeUndefined()
  })
})

describe("applyRules", () => {
  const rules: ColumnRule[] = [
    { id: "rich", column: "px", when: { op: "gt", value: "100-00" }, tone: "up", label: "Rich to the market" },
    { id: "cheap", column: "px", when: { op: "lt", value: "99-16+" }, tone: "down" },
    { id: "any-price", column: "px", when: { op: "notNull" }, tone: "flat" },
    { id: "big", column: "size", when: { op: "gte", value: "10,000,000" }, tone: "primary", target: "row", label: "Large" },
    { id: "gone", column: "status", when: { op: "eq", value: "Done away" }, tone: "stale", target: "row" },
    { id: "elsewhere", column: "nothing", when: { op: "isNull" }, tone: "destructive" },
  ]
  const applied = applyRules(rules, columns)

  it("decorates a cell with the first rule that matches, in list order", () => {
    expect(applied.cell("px", rows[3]!)).toMatchObject({ "data-rule": "rich", "data-tone": "up", "aria-description": "Rich to the market" })
    expect(applied.cell("px", rows[0]!)).toMatchObject({ "data-rule": "cheap", "data-tone": "down", "aria-description": "Price below 99-16+" })
    expect(applied.cell("px", rows[1]!)?.["data-rule"]).toBe("any-price")
    expect(applied.cell("px", rows[2]!)).toBeUndefined()
    expect(applied.cell("client", rows[0]!)).toBeUndefined()
  })

  it("decorates a row with the first row rule that matches, and leaves cell rules to the cells", () => {
    expect(applied.getRowProps(rows[1]!)).toMatchObject({ "data-rule": "big", "data-tone": "primary", "aria-description": "Large" })
    expect(applied.getRowProps(rows[3]!)?.["data-rule"]).toBe("big")
    expect(applied.getRowProps(rows[0]!)).toBeUndefined()
    expect(applied.cell("size", rows[1]!)).toBeUndefined()
  })

  it("paints the tone through the token's class and says the rule in words", () => {
    const decoration = ruleDecoration(rules[0]!, columns)
    expect(decoration.className).toBe(RULE_TONE_CLASS.up)
    expect(decoration.className).toContain("text-up")
    expect(decoration.className).toContain("var(--up-soft)")
    for (const tone of RULE_TONES) {
      expect(RULE_TONE_CLASS[tone]).toMatch(/^text-[\w-]+ bg-\[linear-gradient\(/)
    }
    expect(Object.keys(RULE_TONE_CLASS).sort()).toEqual([...RULE_TONES].sort())
  })

  it("lists the rules that apply by column, and drops one on a column the grid does not have", () => {
    expect([...applied.byColumn.keys()]).toEqual(["px", "size", "status"])
    expect(applied.byColumn.get("px")?.map((rule) => rule.id)).toEqual(["rich", "cheap", "any-price"])
  })
})

describe("the words", () => {
  it("names every op, and narrows them by the column's kind", () => {
    expect(Object.keys(RULE_OP_LABELS).sort()).toEqual([...RULE_OPS].sort())
    expect(opsFor(columns[1])).toBe(NUMBER_OPS)
    expect(opsFor(columns[0])).toBe(TEXT_OPS)
    expect(opsFor(undefined)).toBe(TEXT_OPS)
    expect(NUMBER_OPS).toContain("between")
    expect(TEXT_OPS).not.toContain("between")
    expect(TEXT_OPS).toContain("contains")
    expect(NUMBER_OPS).not.toContain("contains")
  })

  it("describes a rule as the column's name, the op's word, and the value as typed", () => {
    expect(describeRule({ column: "px", when: { op: "gt", value: "99-16+" } }, columns)).toBe("Price above 99-16+")
    expect(describeRule({ column: "client", op: "in", values: ["ALPHA", "BETA"] }, columns)).toBe("Client one of ALPHA, BETA")
    expect(describeRule({ column: "size", when: { op: "between", values: [5, 25] } }, columns)).toBe("Size between 5 and 25")
    expect(describeRule({ column: "px", when: { op: "isNull" } }, columns)).toBe("Price is empty")
    expect(describeRule({ column: "missing", when: { op: "eq", value: 1 } }, columns)).toBe("missing is 1")
    expect(columnName(columns[0])).toBe("Client")
    expect(columnName({ key: "k", header: 3, accessor: () => 0 })).toBe("k")
  })

  it("says why a rule cannot apply", () => {
    expect(ruleProblem({ column: "nothing", when: { op: "isNull" } }, columns)).toBe('No column is named "nothing".')
    expect(ruleProblem({ column: "px", when: { op: "gt" } }, columns)).toBe("above needs a value.")
    expect(ruleProblem({ column: "px", when: { op: "gt", value: "abc" } }, columns)).toBe('"abc" is not a value Price reads.')
    expect(ruleProblem({ column: "size", when: { op: "between", values: [1] } }, columns)).toBe("between needs a low value and a high value.")
    expect(ruleProblem({ column: "size", when: { op: "between", values: ["1", "x"] } }, columns)).toBe('"x" is not a value Size reads.')
    expect(ruleProblem({ column: "client", when: { op: "in", values: [] } }, columns)).toBe("one of needs at least one value.")
    expect(ruleProblem({ column: "client", op: "contains", value: "a" }, columns)).toBeNull()
    expect(ruleProblem({ column: "px", when: { op: "notNull" } }, columns)).toBeNull()
    expect(ruleProblem({ column: "px", when: { op: "eq", value: "99-16+" } }, columns)).toBeNull()
  })
})
