# RulesEditor

Edit one grid's highlights, filters, and sort order, with live match counts.

## Usage

```tsx
import { useState } from "react"
import type { GridRules } from "@/lib/grid-rules"
import type { ColumnDef } from "@/components/ui/data-grid"
import {
  RulesEditor,
  RulesEditorAdd,
  RulesEditorColumn,
  RulesEditorItem,
  RulesEditorOperator,
  RulesEditorProblem,
  RulesEditorRemove,
  RulesEditorTone,
  RulesEditorValue,
} from "@/components/ui/rules-editor"

interface Quote { px: number }
const columns: ColumnDef<Quote>[] = [
  { key: "px", header: "Price", width: 100, numeric: true, accessor: (row) => row.px },
]

function QuoteRules() {
  const [rules, setRules] = useState<GridRules>({
    columns: [{ id: "price", column: "px", when: { op: "gte", value: "100" }, tone: "up" }],
  })
  return (
    <RulesEditor columns={columns} rules={rules} onRulesChange={setRules} className="w-lg max-w-full">
      {rules.columns?.length ? (
        <ul className="space-y-2">
          {rules.columns?.map((rule, index) => (
            <li key={rule.id}>
              <RulesEditorItem kind="highlights" index={index}>
                <RulesEditorColumn />
                <RulesEditorOperator />
                <RulesEditorValue />
                <RulesEditorValue field="low" />
                <RulesEditorValue field="high" />
                <RulesEditorValue field="values" />
                <RulesEditorTone />
                <RulesEditorRemove>Remove</RulesEditorRemove>
                <RulesEditorProblem />
              </RulesEditorItem>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No highlights.</p>
      )}
      <RulesEditorAdd kind="highlights">Add highlight</RulesEditorAdd>
    </RulesEditor>
  )
}
```

## Composition

Use the following composition to build a `RulesEditor`:

```text
RulesEditor
└── Tabs (optional)
    ├── TabsList (optional)
    │   └── TabsTrigger
    │       └── RulesEditorRuleCount (optional)
    ├── TabsContent (optional)
    │   ├── Your list and empty state
    │   │   └── RulesEditorItem
    │   │       ├── RulesEditorColumn
    │   │       ├── RulesEditorOperator (highlights and filters)
    │   │       ├── RulesEditorValue
    │   │       ├── RulesEditorValue field="low"
    │   │       ├── RulesEditorValue field="high"
    │   │       ├── RulesEditorValue field="values"
    │   │       ├── RulesEditorTone (highlights)
    │   │       ├── RulesEditorToneSwatch (optional)
    │   │       ├── RulesEditorTarget (highlights)
    │   │       ├── RulesEditorLabel (highlights)
    │   │       ├── RulesEditorDirection (sort)
    │   │       ├── RulesEditorMatchCount (optional)
    │   │       ├── RulesEditorProblem
    │   │       ├── RulesEditorMove direction="up" (optional)
    │   │       ├── RulesEditorMove direction="down" (optional)
    │   │       └── RulesEditorRemove
    │   ├── RulesEditorAdd
    │   └── RulesEditorFilterCount (optional)
    └── TabsContent value="columns" (optional)
        └── ColumnChooserPanel
```

Place items directly inside your layout when you do not need tabs.

## Tabs

Compose installed [shadcn Tabs](https://ui.shadcn.com/docs/components/tabs) to group rules with a column chooser. Select each tab on focus so arrow keys switch panels on either base.

Control `Tabs` with `value` and `onValueChange` to drive panels from your own controls.

<!-- demo: rules-editor-tabs -->

## Settings layout

Move fields and actions into cards with your own headings and content.

<!-- demo: rules-editor-layout -->

## API Reference

### Props

`RulesEditorProps<T>` extends native `div` props and requires `children`.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `columns` | `ColumnDef<T>[]` | Required | Column definitions shared with the grid. |
| `rules` | `GridRules` | Required | Controlled rules. Omitted lists are empty. |
| `onRulesChange` | `(rules: GridRules) => void` | Required | Receives each edit. |
| `children` | `ReactNode` | Required | Your sections, items, controls, and empty states. |
| `store` | `RowStore<T>` | - | Rows for match counts. |
| `labels` | `Partial<RulesEditorLabels>` | `DEFAULT_RULES_EDITOR_LABELS` | Field, action, count, and region labels. |
| `className` | `string` | - | Additional classes on the root. |

`RulesEditorKind` is `"highlights" | "filters" | "sort"`.

Each item indexes its source list: `"highlights"` uses `rules.columns`, `"filters"` uses `rules.filter`, and `"sort"` uses `rules.sort`.

### Parts

Parts forward refs, classes, and native attributes to their element or the corresponding shadcn control.

| Part | Element | Description |
|---|---|---|
| `RulesEditorItem` | `div` | Requires `kind`, source `index`, and `children`. Coordinates fields and reordering. |
| `RulesEditorColumn` | `NativeSelect` | Column choices from the root. |
| `RulesEditorOperator` | `NativeSelect` | Operators supported by the current column. |
| `RulesEditorValue` | `Input` | Optional `field: "value" \| "low" \| "high" \| "values"`, default `"value"`. Renders only for its operator shape. |
| `RulesEditorTone` | `NativeSelect` | Highlight tone. |
| `RulesEditorToneSwatch` | `span` | Decorative tone name in its color. |
| `RulesEditorTarget` | `NativeSelect` | Highlight target, `"cell"` or `"row"`. |
| `RulesEditorLabel` | `Input` | Highlight description. |
| `RulesEditorDirection` | `NativeSelect` | Sort direction, `"asc"` or `"desc"`. |
| `RulesEditorProblem` | `p` | Validation message when the item has a problem. |
| `RulesEditorMatchCount` | `span` | Independent highlight or filter matches. Requires `store`. |
| `RulesEditorFilterCount` | `span` | Combined filter matches and total rows. Requires `store`. |
| `RulesEditorRuleCount` | `span` | Requires `kind`. Hides zero counts. |
| `RulesEditorAdd` | `Button` | Requires `kind` and `children`. Appends a rule with the helper defaults. |
| `RulesEditorMove` | `Button` | Requires `direction: "up" \| "down"` and `children`. Disabled at the corresponding end. |
| `RulesEditorRemove` | `Button` | Requires `children`. Removes the current item. |

Field values and options belong to the editor. Use `useRulesEditorItem` to replace a control, or cancel its event with `preventDefault()`.

Select classes apply to the shadcn wrapper. Input classes apply to the input.

Item fields, move/remove actions, problems, and match counts require `RulesEditorItem`. Fields for another rule kind render nothing.

### Keyboard and focus

Drag an item onto another item of the same kind, or use Alt+Up/Down from the row or its fields. Reordering uses source indices, even when you render items in a different order.

Accepted moves keep focus on the corresponding field when available. Removal focuses the adjacent item or its remove action, then `RulesEditorAdd` when the list is empty.

### useRulesEditor

Use `useRulesEditor()` inside the root for custom lists and controls.

| Field | Type | Description |
|---|---|---|
| `rules` | `GridRules` | Current controlled rules. |
| `labels` | `RulesEditorLabels` | Merged labels. |
| `columns` | `{ key: string; name: string; ops: readonly RuleOp[] }[]` | Column choices and supported operators. |
| `problem` | `(rule: ColumnRule \| FilterRule) => string \| null` | Validation for the current columns. |
| `change` | `(next: Partial<GridRules>) => void` | Merges changed lists into the controlled rules. |
| `add` | `(kind: RulesEditorKind) => void` | Appends the corresponding new rule. |
| `move` | `(kind: RulesEditorKind, from: number, to: number) => void` | Moves a rule by source index. |
| `remove` | `(kind: RulesEditorKind, index: number) => void` | Removes a rule by source index. |

### useRulesEditorItem

Use `useRulesEditorItem()` inside an item to build a custom field.

| Field | Type | Description |
|---|---|---|
| `kind` | `RulesEditorKind` | Item kind. |
| `index` | `number` | Index in the source list. |
| `name` | `string` | Highlight label or kind name and position. |
| `columnKey` | `string` | Selected column. |
| `condition` | `RuleCondition \| null` | Highlight or filter condition. |
| `highlight` | `ColumnRule \| null` | Current highlight, if applicable. |
| `sort` | `SortRule \| null` | Current sort key, if applicable. |
| `problem` | `string \| null` | Current validation message. |
| `setColumn` | `(key: string) => void` | Changes the column and resets unsupported operators. |
| `setCondition` | `(condition: RuleCondition) => void` | Changes a highlight or filter condition. |
| `updateHighlight` | `(patch: Partial<ColumnRule>) => void` | Updates highlight properties. |
| `setDirection` | `(direction: "asc" \| "desc") => void` | Changes sort direction. |

### It produces rules and keeps nothing

Accept each `onRulesChange` result into `rules` and share it with the grid. Keep a separate draft for a save step.

Edits create a new object and edited list. Untouched lists and rules retain their references.

Replace changed arrays and objects. The editor retains transient drag and comma-field state, including unfinished text such as `ALPHA,`.

### A rule as it is typed

`RulesEditorOperator` offers comparisons and ranges for numeric columns, text matching otherwise, and equality, sets, and null checks for both.

| Operators | `RulesEditorValue` fields |
|---|---|
| `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith` | `"value"` |
| `between` | `"low"` and `"high"`, inclusive |
| `in` | `"values"`, comma separated |
| `isNull`, `notNull` | None |

Render all four value fields: `<RulesEditorValue />`, `<RulesEditorValue field="low" />`, `<RulesEditorValue field="high" />`, and `<RulesEditorValue field="values" />`. Each renders only when the operator needs it.

`withOp` keeps values for the same shape and clears them otherwise. `withColumn` keeps supported conditions, or selects the first operator and drops values.

Values stay as typed strings, read through the column's `parse` function or numerically for numeric columns. A 32nds parser accepts `100-00`.

The set field trims members and drops empties, without quoting or escaping. Enter `1000000` for one numeric member.

### Errors

`RulesEditorProblem` reports missing columns, missing values, and unreadable values without blocking edits or evaluation.

| Condition | Evaluation |
|---|---|
| Unreadable single numeric value | Matches nothing. |
| Mixed valid/invalid `in` set | Valid members can match. |
| Empty text | Can match despite a missing-value message. |
| Missing column | Individual count is zero. Combined filtering and sorting skip it. |

### Highlights

Use `RulesEditorTone`, `RulesEditorTarget`, and `RulesEditorLabel` for highlight properties.

| Property | Values or behavior |
|---|---|
| Tone | `up`, `down`, `flat`, `stale`, `expiring`, `primary`, `destructive`. |
| Target | `"cell"` by default, or `"row"`. |
| Label | Grid description and chooser badge. Blank labels use `describeRule`. |
| Precedence | First matching cell rule per column, and first matching row rule. |

### Filters and the count

Use `RulesEditorMatchCount` for individual matches and `RulesEditorFilterCount` for the combined total.

Every filter on a known column must match.

Counts read all store rows, including hidden rows and highlights that lose precedence. Separate grid filters and custom views do not affect them.

Counts recompute on mount and changes to their rule lists, columns, or store. Store notifications update counts at most once per 250 ms, while edits update immediately.

Repeated count parts share one subscription. Feed updates rerender readings without rerendering editable fields, and pending updates are cancelled on store replacement or unmount.

### Sort

Use `RulesEditorDirection` to set each key's direction. The first key that distinguishes two rows decides their order.

Duplicate keys are allowed. Grid rules break header-sort ties, while a caller-supplied `view` owns filtering and sorting.

### Helpers

Import these helpers from `@/components/ui/rules-editor`. Rule types, `opsFor`, `ruleProblem`, and `describeRule` come from [`grid-rules`](grid-rules.md).

Here `columns` is `readonly ColumnDef<T>[]`, `condition` is `RuleCondition`, and `op` is `RuleOp`.

| Helper | Return type | Behavior |
|---|---|---|
| `valueShape(op)` | `"one" \| "two" \| "many" \| "none"` | Shape in the operator table. |
| `parseValues(text: string)` | `RuleValue[]` | Comma-separated, trimmed, nonempty strings. |
| `valuesText(values: readonly RuleValue[] \| undefined)` | `string` | Joins with `", "`. `null` becomes empty text, and `undefined` gives `""`. |
| `withOp(condition, op)` | `RuleCondition` | Copies for the same shape. Otherwise returns `{ op }`. |
| `withColumn(condition, column: ColumnDef<T> \| undefined)` | `RuleCondition` | Same condition if supported. Otherwise only the first operator. |
| `moveItem<X>(list: readonly X[], from: number, to: number)` | `X[]` | Moves by index. Equal or out-of-bounds indices return an unchanged copy. |
| `newRuleId()` | `string` | Timestamp plus module-local counter. |
| `newHighlight(columns)` | `ColumnRule` | First column/operator, fresh id, tone `"up"`. |
| `newFilter(columns)` | `FilterRule` | First column/operator. |
| `newSort(columns, existing: readonly SortRule[] = [])` | `SortRule` | First unused column, or first column if exhausted. Uses `dir: "asc"`. |

With no columns, add buttons stay enabled. Helpers use an empty key, with `eq` for highlights and filters.

### Labels

Use `labels` to override field names, action names, count templates, and the region title.

Move and remove actions use `<label>: <rule>`. Match their visible text to `labels.moveUp`, `labels.moveDown`, and `labels.remove`.

Fields use `<field>: <rule>`, such as `Value: Rich to the market`. Highlights use their nonblank label, while unnamed items use kind and position.

Use `useRulesEditor().labels` for your tab text, action children, empty states, and drag hint. Count templates accept `{n}` matches and `{m}` total rows.

Operator words use `RULE_OP_LABELS`. Tone names, validation messages, and `ColumnChooserPanel` labels have separate owners.

### What it does not do

The editor emits rules and evaluates counts. The grid applies them, and the caller owns persistence, list markup, empty states, and surrounding content.

### Tokens

Installation adds missing `up`, `down`, `flat`, `stale`, and `expiring` tokens with their soft variants. `primary` and `destructive` use the host theme.
