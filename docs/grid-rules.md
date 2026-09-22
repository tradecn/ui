# grid-rules

Define grid colors, filters, and sort order as plain objects a desk can change without a build.

## Usage

```ts
import type { GridRules } from "@/lib/grid-rules"
```

```tsx
const rules: GridRules = {
  columns: [
    { id: "rich", column: "px", when: { op: "gt", value: "100-00" }, tone: "up", label: "Rich to the market" },
    { id: "large", column: "size", when: { op: "gte", value: "10,000,000" }, tone: "primary", target: "row", label: "Large" },
  ],
  filter: [{ column: "status", op: "ne", value: "Done away" }],
  sort: [
    { key: "size", dir: "desc" },
    { key: "receivedAt", dir: "asc" },
  ],
}

<DataGrid store={store} columns={columns} rules={rules} label="Open RFQs" />
```

## API Reference

### What a rule is

A rule names a column by key and reads each row through its `accessor`. It compares the underlying value, before the cell's display formatting.

`GridRules` groups three optional lists:

| Field | Type | When omitted | Purpose |
|---|---|---|---|
| `columns` | `ColumnRule[]` | No rule decorations | Color cells or rows that match. |
| `filter` | `FilterRule[]` | No rule filtering | Keep rows that match every filter rule. |
| `sort` | `SortRule[]` | No rule ordering | Order by the first rule that distinguishes two rows. |

`ColumnRule` describes a highlight:

| Field | Type | Required / default | Purpose |
|---|---|---|---|
| `id` | `string` | Required | Identifies the applied rule in `data-rule`. |
| `column` | `string` | Required | Key of the column to read. |
| `when` | `RuleCondition` | Required | Condition that triggers the highlight. |
| `tone` | `RuleTone` | Required | Token used for the text and background tint. |
| `label` | `string` | Generated description | Accessible description; a blank label also uses the generated words. |
| `target` | `"cell" \| "row"` | `"cell"` | Paint the cell in `column` or the whole row. |

The first matching cell rule wins for each column. The first matching row rule wins for the row. Cell and row rules apply independently.

`RuleCondition` contains the operator and its inputs. `FilterRule` adds `column`:

| Field | Type | Required / default | Purpose |
|---|---|---|---|
| `column` | `string` | Required on `FilterRule` | Key of the column to read. |
| `op` | `RuleOp` | Required | Operator from the table below. |
| `value` | `RuleValue` | Omitted | Single comparison value, where the operator needs one. |
| `values` | `RuleValue[]` | Omitted | Range endpoints for `between`, or candidates for `in`. |

`RuleValue` is `string | number | boolean | null`. Strings use the column's parser; numbers and booleans are already typed.

`SortRule` has two required fields:

| Field | Type | Purpose |
|---|---|---|
| `key` | `string` | Key of the column to read. |
| `dir` | `"asc" \| "desc"` | Ascending or descending order; missing values stay last either way. |

### Operators

| Operator | Input | Matches | Offered by `opsFor` |
|---|---|---|---|
| `eq` | `value` | Equal value | All columns |
| `ne` | `value` | Unequal, nonmissing value | All columns |
| `gt` | `value` | Above | Numeric columns |
| `gte` | `value` | At or above | Numeric columns |
| `lt` | `value` | Below | Numeric columns |
| `lte` | `value` | At or below | Numeric columns |
| `between` | `values: [low, high]` | Within the range, including both ends | Numeric columns |
| `in` | `values` | Equal to any candidate | All columns |
| `contains` | `value` | Contains the text | Other columns |
| `startsWith` | `value` | Starts with the text | Other columns |
| `isNull` | None | Missing value | All columns |
| `notNull` | None | Nonmissing value | All columns |

For `eq`, `ne`, and `in`, two strings compare without regard to case; a string and a number compare after converting the string to a number. `contains` and `startsWith` convert both sides to lowercase text. Ordering comparisons and sorting use numeric comparison when both sides are numbers, otherwise `String(a).localeCompare(String(b))`.

`null`, `undefined`, `NaN`, and infinities count as missing. A missing row value matches only `isNull`; it fails `notNull` and every other operator, including `ne`. An empty string is a value, not a missing value.

| Helper | Result |
|---|---|
| `RULE_OPS` | All twelve operators. |
| `NUMBER_OPS`, `TEXT_OPS` | The numeric and other-column choices listed above. |
| `RULE_OP_LABELS` | Human-readable wording for each operator. |
| `opsFor(column)` | `NUMBER_OPS` when `column.numeric` is true, otherwise `TEXT_OPS`, including for `undefined`. This is an editor choice list; compilation does not restrict operators by column kind. |
| `columnName(column, key?)` | A nonblank string header, otherwise the column key. Without a column, uses `key` or `""`. |
| `describeRule(rule, columns)` | Words for a `ColumnRule` or `FilterRule`, using values as typed: `Price above 99-16+`, `Client one of ALPHA, BETA`, `Status is empty`. |

### Values are typed in the column's format

`RuleColumn<T>` supplies what the helpers need from a column. [`data-grid`](data-grid.md)'s `ColumnDef<T>` satisfies this interface.

| Field | Type | Required / default | Purpose |
|---|---|---|---|
| `key` | `string` | Required | Name used by rules. |
| `header` | `unknown` | Falls back to `key` | A nonblank string names the column in descriptions and problems. |
| `accessor` | `(row: T) => unknown` | Required | Reads the row value to compare. |
| `numeric` | `boolean` | `false` | Selects numeric parsing and the numeric operator list. |
| `parse` | `(text: string) => unknown` | Numeric or text fallback | Reads a string entered in a rule. |

`readRuleValue(column, value)` accepts a `RuleColumn<T>` or `undefined`, and a `RuleValue` or `undefined`:

| Input | Reading |
|---|---|
| String with a column `parse` | Calls `parse(text)` and normalizes its result. |
| String on a numeric column without `parse` | Trims whitespace, removes commas, replaces Unicode minus (`−`) with `-`, then calls `Number`. Empty or invalid numeric text becomes `null`. |
| Any other string | Keeps the text, including `""`. |
| Number or boolean | Keeps the value, except nonfinite numbers become `null`. |
| `null` or `undefined` | Returns `null`. |

`normalizeValue(value)` maps `null`, `undefined`, `NaN`, and infinities to `null`, leaving other values unchanged. A custom `parse` should return a missing value when it cannot read the text; thrown errors are not caught.

For a 32nds price column, use `parse: (text) => parsePrice(text, convention)` to accept `99-16+`. A numeric size column accepts `5,000,000` without a custom parser. For a boolean column, `parse: (text) => text === "yes"` makes `yes` true and every other string false.

If a required scalar comparison value parses to `null`, the condition matches no rows. As a highlight, it colors nothing; as a filter, it excludes every row. For `in` and `between`, compilation drops values that parse to `null`: `in` uses the remaining candidates, and `between` uses the first two remaining values, low then high. No candidates, or fewer than two endpoints, matches nothing.

`ruleProblem(rule, columns)` accepts a `ColumnRule` or `FilterRule` and returns a problem sentence or `null`. Use it to show missing columns, missing or unreadable inputs, or a range without exactly two endpoints. It checks the supplied rule separately; compilation does not call it. For example, an `in` list containing one readable and one unreadable numeric value reports a problem but still compiles to match the readable value.

### Tones are tokens

`RuleTone` is a token name: `up`, `down`, `flat`, `stale`, `expiring`, `primary`, or `destructive`. `RULE_TONES` lists them; `RULE_TONE_CLASS` maps each to its CSS classes.

The text uses the token color. The background uses its soft variant, or a 12% tint for `primary` and `destructive`. This tint is a background image: a frozen cell keeps its opaque background, and a selected row's highlight shows through.

`ruleDecoration(rule, columns)` returns a `RuleDecoration` for a `ColumnRule`, without checking whether it matches:

| Field | Type | Value |
|---|---|---|
| `data-rule` | `string` | Rule `id`. |
| `data-tone` | `RuleTone` | Rule `tone`. |
| `aria-description` | `string` | Trimmed `label`, or `describeRule(rule, columns)` when the label is absent or blank. |
| `className` | `string` | `RULE_TONE_CLASS[rule.tone]`. |

These attributes carry the rule's meaning alongside its color for tests and assistive technology. In `DataGrid`, an edit rejection takes precedence over the cell's rule description, and your `getRowProps` can override the row's description and data attributes.

### Compiling

The compilation helpers take `RuleColumn<T>` columns. Functions that take rule lists accept readonly rule and column arrays and skip rules naming absent columns.

| Function | Input | Result |
|---|---|---|
| `compileCondition(condition, column)` | One `RuleCondition` and one column | `(row: T) => boolean`. |
| `compileFilter(rules, columns)` | `FilterRule[]` | `(row: T) => boolean`; all compiled conditions must hold. With no rules naming existing columns, every row passes. |
| `compileComparator(rules, columns)` | `SortRule[]` | `(a: T, b: T) => number`, or `undefined` with no rules naming existing columns. Tries rules in order; returns `0` when all tie. |
| `applyRules(rules, columns)` | `ColumnRule[]` | `AppliedRules<T>`, described below. |
| `compareValues(a, b)` | Two values of type `unknown` | Numeric comparison for two numbers, text comparison otherwise; missing values last. |
| `compareDirected(a, b, dir)` | Two values and `"asc"` or `"desc"` | The same comparison in the requested direction, with missing values still last. |

Compilation parses condition inputs before evaluating rows. Compiled conditions read row values through the column's `accessor` as needed. Recompile when rules or columns change.

`AppliedRules<T>` provides:

| Member | Type | Result |
|---|---|---|
| `cell` | `(columnKey: string, row: T) => RuleDecoration \| undefined` | First matching cell rule for this column. |
| `getRowProps` | `(row: T) => RuleDecoration \| undefined` | First matching row rule. |
| `byColumn` | `ReadonlyMap<string, readonly ColumnRule[]>` | All rules naming known columns, grouped by column key in input order, including row rules. |

`DataGrid` compiles its `rules` prop itself. Its header sort takes precedence, with rule sorting breaking ties; its `filter` callback must pass along with rule filters. With a custom `view`, the grid ignores rule filtering and sorting but still applies decorations. Keep rule arrays and columns stable between renders until they change.

Use the helpers directly for your own grid, a custom `view`, or [`rfq-stack`](rfq-stack.md)'s `useRfqStackView`.

### What it does not do

The helpers compare row values with rule values. Your application owns storage and permissions; the rules are plain JSON data you can save or share.

### Tokens

The install adds the `up`, `down`, `flat`, `stale`, and `expiring` tokens with their soft variants, if you do not have them. `primary` and `destructive` are shadcn's own.
