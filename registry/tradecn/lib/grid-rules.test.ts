import { describe, expect, it } from "vitest"
import { formatFraction, parsePrice } from "@/registry/tradecn/lib/format"
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
  readColumnRule,
  readCondition,
  readFilterRule,
  readRuleValue,
  readRules,
  readSortRule,
  ruleDecoration,
  ruleProblem,
  type ColumnRule,
  type GridRules,
  type RuleColumn,
  type RuleCondition,
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
    expect(decoration.className).toContain("var(--up-soft)")
    // On the tint the text is the foreground, and up, down, and flat text inside takes it too.
    for (const tone of RULE_TONES) {
      const classes = RULE_TONE_CLASS[tone].split(" ")
      expect(classes[0]).toBe("text-foreground")
      expect(classes).toEqual(expect.arrayContaining(["[&_.text-up]:text-inherit", "[&_.text-down]:text-inherit", "[&_.text-flat]:text-inherit"]))
      expect(classes.at(-1)).toMatch(/^bg-\[linear-gradient\(/)
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

  it("snaps a decimal threshold to the column's grid and says the price it compares", () => {
    const px = { ...columns[2]!, format: (value: unknown) => formatFraction(value as number | null, THIRTY_SECONDS) }
    // The threshold reads through parse, so it lives on the printable grid: the snapped-equal
    // row is not above it, equality matches the grid price, and the words print that price.
    const row = { px: 99.703125 } as Rfq
    expect(compileCondition({ op: "gt", value: "99.7" }, px)(row)).toBe(false)
    expect(compileCondition({ op: "eq", value: "99.7" }, px)(row)).toBe(true)
    expect(compileCondition({ op: "lt", value: "99.71" }, px)(row)).toBe(false)
    expect(describeRule({ column: "px", when: { op: "gt", value: "99.7" } }, [px])).toBe("Price above 99-22+")
    expect(describeRule({ column: "px", when: { op: "between", values: ["99.7", "99.8"] } }, [px])).toBe("Price between 99-22+ and 99-25+")
    // Without a format the words keep the typed text, and a parser's NaN never prints: the
    // comparison treats it as nothing to match, so the words stay as typed too.
    expect(describeRule({ column: "px", when: { op: "gt", value: "99.7" } }, columns)).toBe("Price above 99.7")
    const broken = { ...columns[2]!, parse: () => Number.NaN, format: (value: unknown) => formatFraction(value as number | null, THIRTY_SECONDS) }
    expect(describeRule({ column: "px", when: { op: "gt", value: "99.7" } }, [broken])).toBe("Price above 99.7")
    // A parser's throw propagates, exactly as compileCondition and ruleProblem let it; only a
    // row-hungry format falls back to the typed text.
    const throwing = { ...columns[2]!, parse: () => { throw new Error("bad parser") }, format: () => "never" }
    expect(() => describeRule({ column: "px", when: { op: "gt", value: "99.7" } }, [throwing])).toThrow("bad parser")
    const rowHungry = { ...columns[2]!, format: (value: unknown, row?: { px: number }) => String(row!.px * (value as number)) }
    expect(describeRule({ column: "px", when: { op: "gt", value: "99.7" } }, [rowHungry])).toBe("Price above 99.7")
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

describe("rules that arrive malformed", () => {
  // Rules come as JSON a desk edits without a build: what this module cannot read matches nothing, says what is
  // wrong through ruleProblem, and never throws while the grid draws.
  const bad = (when: unknown) => ({ id: "bad", column: "px", when, tone: "up" }) as unknown as ColumnRule

  it("compiles a condition with no op it knows, no condition, or values that are not a list to one that matches nothing", () => {
    for (const condition of [{ op: "gtx", value: "99-16" }, { op: "toString" }, { op: "between", values: "99-16, 100-00" }, { op: "in", values: { 0: "ALPHA" } }, undefined, null, "gt"]) {
      expect(rows.filter(compileCondition(condition as RuleCondition, columns[2]!))).toEqual([])
    }
    // Read directly, a value that is not text, a number, or a boolean is nothing; compiled, it is read first, as its
    // JSON text, the same way a filter list reads it.
    expect(readRuleValue(columns[0], {} as never)).toBeNull()
    const quoted = [{ ...rows[0]!, client: '{"a":1}' }, rows[1]!]
    expect(byId(quoted.filter(compileCondition({ op: "eq", value: { a: 1 } as never }, columns[0]!)))).toEqual(["a"])
    expect(byId(quoted.filter(compileFilter([{ column: "client", op: "eq", value: { a: 1 } as never }], columns)))).toEqual(["a"])
  })

  it("leaves a grid running on highlights it cannot read: those decorate nothing, an unknown tone paints nothing, and the rest decorate", () => {
    const applied = applyRules([
      bad({ op: "gtx", value: "99-16" }),
      bad(undefined),
      null as never,
      { id: "odd", column: "status", when: { op: "eq", value: "Quoted" }, tone: "warning" as never, label: 5 as never },
      { id: "rich", column: "px", when: { op: "gt", value: "100-00" }, tone: "up" },
    ], columns)
    expect(applied.cell("px", rows[0]!)).toBeUndefined()
    expect(applied.cell("px", rows[3]!)?.["data-rule"]).toBe("rich")
    const odd = applied.cell("status", rows[1]!)!
    expect(odd["data-rule"]).toBe("odd")
    expect(odd.className).toBe("")
    expect(odd["aria-description"]).toBe("Status is Quoted")
  })

  it("filters out every row for a filter rule it cannot read, as for a value it cannot read, and skips an entry that is not a rule", () => {
    expect(byId(rows.filter(compileFilter([{ column: "status", op: "ne", value: "Done away" }, null as never], columns)))).toEqual(["a", "b", "c"])
    expect(rows.filter(compileFilter([{ column: "status", op: "ne", value: "Done away" }, { column: "px", op: "gtx" as never, value: "99-16" }], columns))).toEqual([])
    const order = compileComparator([null as never, { key: "size", dir: "desc" }], columns)!
    expect(byId([...rows].sort(order))).toEqual(["b", "d", "a", "c"])
  })

  it("says what is wrong with a rule it cannot read, and describes one without throwing", () => {
    expect(ruleProblem(bad({ op: "gtx" }), columns)).toBe('No comparison is named "gtx".')
    expect(ruleProblem(bad({ op: "toString" }), columns)).toBe('No comparison is named "toString".')
    expect(ruleProblem(bad(undefined), columns)).toBe("The rule needs a comparison.")
    expect(ruleProblem(bad("gt"), columns)).toBe("The rule needs a comparison.")
    expect(ruleProblem({ column: "px" }, columns)).toBe("The rule needs a comparison.")
    expect(ruleProblem(bad({ op: "between", values: "99-16, 100-00" }), columns)).toBe("between needs a low value and a high value.")
    expect(ruleProblem(bad({ op: "between", values: ["100-00", "99-16"] }), columns)).toBe("between needs a low value at or below the high value.")
    expect(ruleProblem(bad({ op: "between", values: ["99-16", "99-16"] }), columns)).toBeNull()
    expect(ruleProblem(bad({ op: "gt", value: {} }), columns)).toBe('"{}" is not a value Price reads.')
    expect(ruleProblem(bad({ op: "in", values: [[1]] }), columns)).toBe('"[1]" is not a value Price reads.')
    expect(ruleProblem({ column: "px", when: { op: "notNull" }, tone: "warning" as never }, columns)).toBe('No tone is named "warning".')
    expect(ruleProblem({ column: "px", when: { op: "notNull" }, tone: "up" }, columns)).toBeNull()
    expect(ruleProblem(bad({ op: 5 }), columns)).toBe('No comparison is named "5".')
    expect(ruleProblem(bad({ op: { name: "gt" } }), columns)).toBe('No comparison is named "{"name":"gt"}".')
    expect(ruleProblem(bad({ op: null }), columns)).toBe("The rule needs a comparison.")
    expect(ruleProblem({ column: "px", when: { op: "notNull" }, tone: undefined }, columns)).toBe("The rule needs a tone.")
    expect(describeRule(bad({ op: "gtx", value: "99-16" }), columns)).toBe("Price gtx 99-16")
    expect(describeRule(bad({ op: "in", values: ["ALPHA", { x: 1 }] }), columns)).toBe('Price one of ALPHA, {"x":1}')
    expect(describeRule(bad(undefined), columns)).toBe("Price")
    expect(() => describeRule(bad({ op: "between", values: "x" }), columns)).not.toThrow()
  })
})

describe("reading rules a desk saved", () => {
  // An own toString that is not a function: String() and a property lookup both throw on it.
  const evil = { toString: 0 }

  it("reads any JSON into rules: lists as lists, names and words as text, values as text, numbers, booleans, or null, and an entry that is not an object dropped", () => {
    expect(readRules(null)).toStrictEqual({})
    // A list that is not a list is left out, so spreading the reading over defaults keeps the defaults.
    expect(readRules({ columns: { id: "x" }, filter: "bad", sort: 5 })).toStrictEqual({})
    expect({ sort: [{ key: "size", dir: "asc" }], ...readRules({ sort: "bad" }) }.sort).toEqual([{ key: "size", dir: "asc" }])
    const read = readRules({
      columns: [null, 5, "bad", { id: 7, column: { key: "px" }, when: { op: evil, value: { a: 1 }, values: "x" }, tone: ["up"], label: 9, target: "cell" }],
      filter: [{ column: "status", op: "eq", value: "Open", values: [1, {}, undefined, null] }],
      sort: [{ key: ["px"], dir: "down" }, { key: "size", dir: "desc" }],
    })
    expect(read.columns).toEqual([{ id: "7", column: '{"key":"px"}', when: { op: '{"toString":0}', value: '{"a":1}' }, tone: '["up"]', target: "cell" }])
    expect(read.filter).toEqual([{ column: "status", op: "eq", value: "Open", values: [1, "{}", null] }])
    expect(read.sort).toEqual([{ key: '["px"]', dir: "asc" }, { key: "size", dir: "desc" }])
    expect(readColumnRule(null)).toBeNull()
    // A list is no rule, whatever it holds.
    expect(readFilterRule([])).toBeNull()
    expect(readRules({ columns: [[{ id: "x" }]] })).toStrictEqual({ columns: [] })
    expect(readSortRule("px")).toBeNull()
    expect(readCondition("gt")).toBeUndefined()
    // A value JSON cannot print reads as its text: a bigint as its digits.
    expect(readColumnRule({ id: "r", column: "px", when: { op: "gt", value: 1n }, tone: "up" })?.when?.value).toBe("1")
  })

  it("keeps every other field an app saved on a rule, its condition, a filter, a sort key, and the rules, and leaves out a field it reads to nothing", () => {
    const read = readRules({
      version: 2,
      columns: [{ id: "rich", column: "px", when: { op: "gte", value: "100-00", note: "desk" }, tone: "up", owner: "desk-a", label: 5 }],
      filter: [{ id: "f1", column: "status", op: "eq", value: "Open", enabled: true }],
      sort: [{ key: "size", dir: "desc", pinned: true }],
    }) as GridRules & { version?: number }
    expect(read.version).toBe(2)
    expect(read.columns).toStrictEqual([{ id: "rich", column: "px", when: { op: "gte", value: "100-00", note: "desk" }, tone: "up", owner: "desk-a" }])
    expect(read.filter).toStrictEqual([{ id: "f1", column: "status", op: "eq", value: "Open", enabled: true }])
    expect(read.sort).toStrictEqual([{ key: "size", dir: "desc", pinned: true }])
    // A rule with no id, column, or tone reads without them, not with empty text that a column keyed "" would match.
    expect(readColumnRule({ when: { op: "notNull" } })).toStrictEqual({ when: { op: "notNull" } })
    // A target that is neither the row nor the cell reads as no target, the cell.
    expect(readColumnRule({ id: "t", target: "diagonal" })).toStrictEqual({ id: "t" })
    const decoration = ruleDecoration({ column: "px", when: { op: "notNull" } } as never, columns)
    expect(decoration["data-rule"]).toBe("")
    expect(decoration["data-tone"]).toBeUndefined()
  })

  it("judges and describes a rule as the kind it is told, whatever keys it carries, and reads a column saved as a number", () => {
    const filterWithTone = { column: "px", op: "gt", value: "100-00", tone: "desk" } as never
    expect(ruleProblem(filterWithTone, columns, "filter")).toBeNull()
    expect(describeRule(filterWithTone, columns, "filter")).toBe("Price above 100-00")
    const flattened = readColumnRule({ column: "status", when: null, tone: null, op: "eq", value: "Open" })!
    expect(ruleProblem(flattened as never, columns, "highlight")).toBe("The rule needs a comparison.")
    expect(describeRule(flattened as never, columns, "highlight")).toBe("Status")
    expect(ruleProblem({ column: "px", when: { op: "notNull" } } as never, columns, "highlight")).toBe("The rule needs a tone.")
    // A column keyed "" is a column: only a missing key needs one.
    const blank: RuleColumn<Rfq>[] = [{ key: "", header: "Blank", accessor: () => null }]
    expect(ruleProblem({ column: "", op: "isNull" } as never, blank, "filter")).toBeNull()
    expect(ruleProblem({ op: "isNull" } as never, blank, "filter")).toBe("The rule needs a column.")
    // A condition saved as a list is none, as the grid reads it, whatever op it carries.
    const listed = Object.assign([], { op: "notNull" })
    expect(ruleProblem({ column: "px", when: listed, tone: "up" } as never, columns, "highlight")).toBe("The rule needs a comparison.")
    expect(rows.filter(compileCondition(listed as never, columns[2]!))).toEqual([])
    // A tone saved as "" is none, as the editor shows it.
    expect(ruleProblem({ column: "px", when: { op: "notNull" }, tone: "" } as never, columns, "highlight")).toBe("The rule needs a tone.")
    const seven: RuleColumn<Rfq>[] = [{ key: "7", header: "Seven", accessor: () => null }]
    expect(describeRule({ column: 7, op: "isNull" } as never, seven, "filter")).toBe("Seven is empty")
  })

  it("judges and describes a rule that is not an object, a highlight in the filter's shape, and a number JSON cannot print", () => {
    expect(ruleProblem(null as never, columns)).toBe("The rule needs a column.")
    expect(describeRule(null as never, columns)).toBe("")
    expect(describeRule(5 as never, columns)).toBe("")
    // A tone makes it a highlight, whose condition lives in `when`, as the grid reads it.
    expect(ruleProblem({ id: "flat", column: "px", op: "gt", value: "100-00", tone: "up" } as never, columns)).toBe("The rule needs a comparison.")
    expect(ruleProblem({ column: "px", when: { op: Number.NaN } } as never, columns)).toBe('No comparison is named "NaN".')
  })

  it("compiles, decorates, describes, and judges such rules without throwing, and puts only text on the elements", () => {
    const raw = [
      { id: evil, column: "px", when: { op: evil }, tone: evil },
      { id: "obj", column: { key: "px" }, when: { op: "notNull" }, tone: "up" },
      { id: "arr", column: "px", when: { op: ["notNull"] }, tone: ["up"] },
      { id: "fine", column: "px", when: { op: "notNull" }, tone: { name: "up" } },
    ] as unknown as ColumnRule[]
    const applied = applyRules(raw, columns)
    const decoration = applied.cell("px", rows[0]!)!
    expect(decoration["data-rule"]).toBe("fine")
    expect(decoration["data-tone"]).toBe('{"name":"up"}')
    expect(decoration.className).toBe("")
    for (const rule of raw) {
      expect(() => describeRule(rule, columns)).not.toThrow()
      expect(() => ruleProblem(rule, columns)).not.toThrow()
      expect(typeof ruleDecoration(rule, columns)["data-rule"]).toBe("string")
    }
    expect(ruleProblem(raw[0]!, columns)).toBe('No comparison is named "{"toString":0}".')
    expect(ruleProblem(raw[1]!, columns)).toBe('No column is named "{"key":"px"}".')
    expect(ruleProblem({ column: undefined } as never, columns)).toBe("The rule needs a column.")
    expect(describeRule(raw[0]!, columns)).toBe('Price {"toString":0}')
    // A value the editor would show as text is judged as that text: readable on a text column, not on a number column.
    expect(ruleProblem({ column: "client", op: "eq", value: { a: 1 } } as never, columns)).toBeNull()
    expect(ruleProblem({ column: "size", op: "eq", value: { a: 1 } } as never, columns)).toBe('"{"a":1}" is not a value Size reads.')
    expect(rows.filter(compileFilter({ length: 2 } as never, columns))).toEqual(rows)
    expect(compileComparator("px" as never, columns)).toBeUndefined()
    expect(compileComparator({ length: 1, 0: { key: "size", dir: "asc" } } as never, columns)).toBeUndefined()
    expect(describeRule(raw[1]!, columns)).toBe('{"key":"px"} is not empty')
    expect(applyRules({ length: 1, 0: raw[3] } as never, columns).byColumn.size).toBe(0)
  })
})
