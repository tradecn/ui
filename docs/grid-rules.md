# grid-rules

Define grid colors, filters, and sort order as plain objects a desk can change without a build.

## Usage

```tsx
import { applyRules, describeRule, type ColumnRule, type RuleColumn } from "@/lib/grid-rules"

interface Request {
  id: string
  size: number
}

const columns: RuleColumn<Request>[] = [{ key: "size", header: "Size", numeric: true, accessor: (row) => row.size }]
const rule: ColumnRule = { id: "large", column: "size", when: { op: "gte", value: "10,000,000" }, tone: "primary" }
const applied = applyRules([rule], columns)
const rows: Request[] = [{ id: "Q-1", size: 5_000_000 }, { id: "Q-2", size: 10_000_000 }]

function SizeRule() {
  return (
    <div className="w-fit max-w-full space-y-3 text-xs lining-nums tabular-nums">
      <p>{describeRule(rule, columns)}</p>
      <table className="text-left">
        <thead className="text-muted-foreground">
          <tr><th scope="col" className="px-2 py-1 font-medium">Request</th><th scope="col" className="px-2 py-1 text-right font-medium">Size</th><th scope="col" className="px-2 py-1 font-medium">Rule</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const decoration = applied.cell("size", row)
            return (
              <tr key={row.id} className="border-t border-border">
                <th scope="row" className="px-2 py-1 font-normal">{row.id}</th>
                <td {...decoration} className={`px-2 py-1 text-right ${decoration?.className ?? ""}`}>{row.size.toLocaleString("en-US")}</td>
                <td className="px-2 py-1">{decoration ? "Matched" : "No match"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

`applyRules` compiles the rule against the column's accessor. A matching cell receives its decoration; a nonmatching cell receives `undefined`. Spread the decoration onto your cell and keep its `className` when adding your own styles. The returned attributes include the rule id, tone, and accessible description.

The numeric column reads the string `10,000,000` as a number. This example uses only the GridRules library; the DataGrid composition below handles the decorations for you.

## Filtering and sorting

Compile a filter and comparator when you work with rows outside DataGrid. Here the filter keeps requests of at least 2,000,000. Sorting groups by status first, then orders each group from largest to smallest. Turn either control off to compare the result with the original rows and source order.

The rules and columns are fixed, so their functions are compiled once. Filtering or copying produces a new array before sorting; the source rows keep their order.

<!-- demo: grid-rules-filter-sort -->

## DataGrid highlights

Install [`data-grid`](data-grid.md) as well; it supplies the grid, row store, and format helpers used here. Pass a `GridRules` object to its `rules` prop and the grid compiles it. This example isolates highlights from filtering and sorting.

The price column's parser reads rule values such as `100-00` in 32nds. Cell rules mark rich and cheap prices; row rules mark large requests and requests done away. Q-2 matches a price rule and a row rule independently. Q-3 is small enough to reach the done-away rule; if it also matched the earlier large rule, that row rule would win. Q-4 has no price, so neither price comparison matches.

Toggle **Show highlights** to compare the decorations. The descriptions below the grid state each condition and its target. The preview alignment controls keep an edge fixed while resizing columns, and save that choice across examples.

<!-- demo: grid-rules-data-grid -->

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
| `tone` | `RuleTone` | Required | Token whose tint goes behind the matched cell or row. |
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
| `describeRule(rule, columns, kind?)` | Words for a highlight or a filter rule, written or read, judged as `kind` as `ruleProblem` judges it: `Price above 99-16+`, `Client one of ALPHA, BETA`, `Status is empty`. A string value prints through the column's `format` over its parsed, normalized reading when the column has both `parse` and `format`, so the words say what the rule compares; it stays as typed otherwise. |

### Values are typed in the column's format

`RuleColumn<T>` supplies what the helpers need from a column. [`data-grid`](data-grid.md)'s `ColumnDef<T>` satisfies this interface.

| Field | Type | Required / default | Purpose |
|---|---|---|---|
| `key` | `string` | Required | Name used by rules. |
| `header` | `unknown` | Falls back to `key` | A nonblank string names the column in descriptions and problems. |
| `accessor` | `(row: T) => unknown` | Required | Reads the row value to compare. |
| `numeric` | `boolean` | `false` | Selects numeric parsing and the numeric operator list. |
| `parse` | `(text: string) => unknown` | Numeric or text fallback | Reads a string entered in a rule. |
| `format` | `(value: unknown) => string` | Values stay as typed | Prints a parsed rule value in descriptions. It is called without a row, so a `ColumnDef` `format` fits when it reads only the value. |

`readRuleValue(column, value)` accepts a `RuleColumn<T>` or `undefined`, and a `RuleValue` or `undefined`:

| Input | Reading |
|---|---|
| String with a column `parse` | Calls `parse(text)` and normalizes its result. |
| String on a numeric column without `parse` | Trims whitespace, removes commas, replaces Unicode minus (`−`) with `-`, then calls `Number`. Empty or invalid numeric text becomes `null`. |
| Any other string | Keeps the text, including `""`. |
| Number or boolean | Keeps the value, except nonfinite numbers become `null`. |
| `null` or `undefined` | Returns `null`. |
| Anything else, such as an object or a list from unread JSON | Returns `null`. |

`normalizeValue(value)` maps `null`, `undefined`, `NaN`, and infinities to `null`, leaving other values unchanged. A custom `parse` should return a missing value when it cannot read the text; thrown errors are not caught.

For a 32nds price column, use `parse: (text) => parsePrice(text, convention)` to accept `99-16+`. A decimal threshold then snaps to the convention's printable grid like any other parsed price, so `gt "99.7"` compares against `99.703125` in 32nds; give the column a `format` and `describeRule` prints that compared price (`Price above 99-22+`) instead of the typed text. A numeric size column accepts `5,000,000` without a custom parser. For a boolean column, `parse: (text) => text === "yes"` makes `yes` true and every other string false.

If a required scalar comparison value parses to `null`, the condition matches no rows. As a highlight, it colors nothing; as a filter, it excludes every row. For `in` and `between`, compilation drops values that parse to `null`: `in` uses the remaining candidates, and `between` uses the first two remaining values, low then high. No candidates, or fewer than two endpoints, matches nothing.

Rules arrive as data, so a rule that can't be read never throws. Read rules a desk saved or shared with `readRules` before you hold them: a list that isn't a list reads as none, an entry that isn't an object, a list included, is dropped, every name and word reads as text, and a value that isn't text, a number, a boolean, or `null` reads as text, its JSON where it has one, so the value the editor shows is the value compared. An op or a tone this version doesn't know stays as its text for `ruleProblem` to name. A `dir` other than `"desc"` reads as ascending, and a `target` other than `"row"` or `"cell"`, or a `label` that isn't text, reads to nothing. A field that reads to nothing is left out, so any field of a read rule can be missing, and an edit saves the rule without it. Every field the readers don't read passes through, so the fields your app keeps on a rule survive an edit. The grid, the editor, the column chooser, and the helpers below read each entry the same way, so unread JSON doesn't throw either.

A condition that is missing, or names an op not in `RULE_OPS`, matches no rows, like an unreadable value, and so do `in` and `between` when their `values` aren't a list. A tone outside `RULE_TONES` paints nothing, and the rule's words still describe the cells it matches.

`ruleProblem(rule, columns, kind?)` accepts a highlight or a filter rule, written or read, and returns a problem sentence or `null`. Pass `kind`, a `RuleKind` (`"highlight"` or `"filter"`), when you know the rule's list: a filter can carry a field of your own named `tone`, and a read highlight can lack its `when`. Without `kind`, a rule with a `when` or a `tone` key is judged as a highlight, and its tone is checked only when it has the key; with `kind: "highlight"`, a missing tone is a problem too. Use it to show missing columns, a missing or unknown comparison, missing or unreadable inputs, a range without exactly two endpoints or with its low end above its high end, and a missing or unknown tone. It checks the supplied rule separately; compilation does not call it. For example, an `in` list containing one readable and one unreadable numeric value reports a problem but still compiles to match the readable value.

### Tones are tokens

`RuleTone` is a token name: `up`, `down`, `flat`, `stale`, `expiring`, `primary`, or `destructive`. `RULE_TONES` lists them; `RULE_TONE_CLASS` maps each to its CSS classes, `ON_TINT_CLASS` and the tint.

A tone is a tint: the token's soft variant, or a 12% tint for `primary` and `destructive`, painted as a background image so a frozen cell keeps its opaque background under it. Text on the tint is the foreground color, and `text-up`, `text-down`, `text-flat`, `text-stale`, `text-expiring`, `text-destructive`, and `text-primary` text inside takes the foreground too: a state color on a tint falls below 4.5 to 1 in light mode, and a signed value still shows its direction by its sign. The override reaches the tinted element's descendants only, so a state class on the decorated element itself competes with the tone's `text-foreground` by class order. `ON_TINT_CLASS` is that text treatment alone: the foreground and the seven overrides, for a tint of your own behind text.

`ruleDecoration(rule, columns)` returns a `RuleDecoration` for a highlight, written or read, without checking whether it matches:

| Field | Type | Value |
|---|---|---|
| `data-rule` | `string` | Rule `id`, as text, or empty for a rule without one. |
| `data-tone` | `string`, optional | Rule `tone`, as text, and absent for a rule without one. One outside `RULE_TONES` paints nothing. |
| `aria-description` | `string` | Trimmed `label`, or `describeRule(rule, columns, "highlight")` when the label is absent, blank, or not text. |
| `className` | `string` | `RULE_TONE_CLASS[rule.tone]`, or empty for a tone outside `RULE_TONES`. |

These attributes carry the rule's meaning alongside its color for tests and assistive technology. In `DataGrid`, an edit rejection takes precedence over the cell's rule description, and your `getRowProps` can override the row's description and data attributes.

### Reading saved rules

The readers return looser types than the ones you write: `ReadGridRules`, `ReadColumnRule`, `ReadFilterRule`, `ReadSortRule`, and `ReadCondition`. Any field can be missing, and an op or a tone can be text this version doesn't know, so code that reads a read rule checks its fields first. Every helper, the grid, and the editor take these types, and rules you wrote fit them too.

| Function | Input | Result |
|---|---|---|
| `readRules(value)` | Any JSON | `ReadGridRules`, each list read with the readers below. A list that isn't a list is absent, and an entry that isn't an object, a list included, is dropped. |
| `readColumnRule(value)` | Any JSON | A `ReadColumnRule`, or `null` when the value isn't an object, a list included. Its label stays only when it is text, and its target only when it says `"row"` or `"cell"`. |
| `readFilterRule(value)` | Any JSON | A `ReadFilterRule`, or `null` when the value isn't an object, a list included. |
| `readSortRule(value)` | Any JSON | A `ReadSortRule`, or `null` when the value isn't an object, a list included. Its direction is descending only when it says `"desc"`. |
| `readCondition(value)` | Any JSON | A `ReadCondition`, or `undefined` when the value isn't an object, a list included. Its `values` come only from a list. |

### Compiling

The compilation helpers take `RuleColumn<T>` columns. Functions that take rule lists accept readonly rule and column arrays and skip rules naming absent columns.

| Function | Input | Result |
|---|---|---|
| `compileCondition(condition, column)` | One condition, written or read, and one column | `(row: T) => boolean`. |
| `compileFilter(rules, columns)` | Filter rules, written or read | `(row: T) => boolean`; all compiled conditions must hold. With no rules naming existing columns, every row passes. |
| `compileComparator(rules, columns)` | Sort keys, written or read | `(a: T, b: T) => number`, or `undefined` with no rules naming existing columns. Tries rules in order; returns `0` when all tie. |
| `applyRules(rules, columns)` | Highlights, written or read | `AppliedRules<T>`, described below. |
| `compareValues(a, b)` | Two values of type `unknown` | Numeric comparison for two numbers, text comparison otherwise; missing values last. |
| `compareDirected(a, b, dir)` | Two values and `"asc"` or `"desc"` | The same comparison in the requested direction, with missing values still last. |

Compilation reads its input as `readRules` does, then parses condition inputs before evaluating rows, so a condition compiled alone compares what the same condition in a list compares. Compiled conditions read row values through the column's `accessor` as needed. Recompile when rules or columns change.

`AppliedRules<T>` provides:

| Member | Type | Result |
|---|---|---|
| `cell` | `(columnKey: string, row: T) => RuleDecoration \| undefined` | First matching cell rule for this column. |
| `getRowProps` | `(row: T) => RuleDecoration \| undefined` | First matching row rule. |
| `byColumn` | `ReadonlyMap<string, readonly ReadColumnRule[]>` | All rules naming known columns, each as read with every field you saved, grouped by column key in input order, including row rules. |

`DataGrid` compiles its `rules` prop itself. Its header sort takes precedence, with rule sorting breaking ties; its `filter` callback must pass along with rule filters. With a custom `view`, the grid ignores rule filtering and sorting but still applies decorations. Keep rule arrays and columns stable between renders until they change.

Use the helpers directly for your own grid, a custom `view`, or [`rfq-stack`](rfq-stack.md)'s `useRfqStackView`.

### What it does not do

The helpers compare row values with rule values. Your application owns storage and permissions; the rules are plain JSON data you can save or share.

### Tokens

The install adds the soft variants of the `up`, `down`, `flat`, `stale`, and `expiring` tokens, which the tones tint with, if you do not have them. `primary` and `destructive` are shadcn's own.
