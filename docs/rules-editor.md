# RulesEditor

Edit one grid's highlights, filters, and sort order, with live match counts and an optional Columns tab for the column chooser.

## Usage

```tsx
import { useState } from "react"
import { createInstrumentFormatter, formatNotional } from "@/lib/format"
import type { GridRules } from "@/lib/grid-rules"
import { createRowStore } from "@/lib/row-store"
import { DataGrid, type ColumnDef, type ColumnState } from "@/components/ui/data-grid"
import { RulesEditor } from "@/components/ui/rules-editor"

interface Rfq {
  id: string
  client: string
  size: number
  px: number | null
}

const ust = createInstrumentFormatter({ price: { kind: "fraction", denominator: 32, half: "+" }, tick: 1 / 64 })

const columns: ColumnDef<Rfq>[] = [
  { key: "client", header: "Client", width: 180, sortable: true, accessor: (r) => r.client },
  { key: "size", header: "Size", width: 160, numeric: true, sortable: true, accessor: (r) => r.size, format: (v) => formatNotional(v as number, { unit: "mm" }) },
  { key: "px", header: "Price", width: 170, numeric: true, font: "mono", sortable: true, accessor: (r) => r.px, format: (v) => ust.price(v as number | null), parse: ust.parsePrice },
]

const rows: Rfq[] = [
  { id: "Q-1", client: "ALPHA", size: 5_000_000, px: 99.5 },
  { id: "Q-2", client: "BETA", size: 25_000_000, px: 100.015625 },
  { id: "Q-3", client: "GAMMA", size: 10_000_000, px: null },
]

// The editor and the grid share one rules object and one column state. Edit a rule and the grid follows the keystroke.
function QuoteRules() {
  const [store] = useState(() => {
    const s = createRowStore<Rfq>({ getRowId: (r) => r.id })
    s.applyDeltas({ upsert: rows })
    return s
  })
  const [rules, setRules] = useState<GridRules>({
    columns: [{ id: "threshold", column: "px", when: { op: "gte", value: "100-00" }, tone: "primary", label: "Price threshold" }],
    filter: [],
    sort: [],
  })
  const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
  return (
    <div className="w-lg max-w-full space-y-3">
      <RulesEditor className="overflow-x-auto" columns={columns} rules={rules} onRulesChange={setRules} store={store} columnState={columnState} onColumnStateChange={setColumnState} />
      <div className="h-48">
        <DataGrid store={store} columns={columns} preset="watchlist" label="Quotes with rules" rules={rules} columnState={columnState} onColumnStateChange={setColumnState} />
      </div>
    </div>
  )
}
```

The editor and grid share one controlled rules object. Change the price threshold from `100-00` to `99-00`: the match count grows from one to two, and both price cells highlight. The blank price stays unmatched. Filters and Sort start empty; add rules in those tabs to narrow or reorder the same three rows.

## Composition

The first three tabs edit [`GridRules`](grid-rules.md): Highlights edits `columns`, Filters edits `filter`, and Sort edits `sort`. Columns embeds [`ColumnChooserPanel`](column-chooser.md) when both `columnState` and `onColumnStateChange` are supplied. The example shares that state with the grid too; omit both props from the editor when you do not need the Columns tab. The RulesEditor installation includes the grid, chooser, formatter, and store used here.

Left/Right wrap through tabs; Home/End select the first/last. `defaultTab` chooses the initial tab only. If Columns is selected but unavailable, Highlights is shown; Columns returns when both props return unless another tab was selected.

Each rule list has draggable rows, `Move up`, `Move down`, `Remove`, and an add button. Drag onto another row to take its place, or use Alt+Up/Down on a focused row. Move buttons are disabled at the ends.

## API Reference

### Props

`RulesEditorProps<T>` uses the grid's row type. `RulesEditorTab` is `"highlights" | "filters" | "sort" | "columns"`.

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `columns` | `ColumnDef<T>[]` | Required | Column definitions shared with the grid. |
| `rules` | `GridRules` | Required | Controlled rules; omitted lists appear empty. |
| `onRulesChange` | `(rules: GridRules) => void` | Required | Receives each rule edit. |
| `store` | `RowStore<T>` | Omitted | Rows for match counts. |
| `columnState` | `ColumnState` | Omitted | Chooser state. |
| `onColumnStateChange` | `(state: ColumnState) => void` | Omitted | Chooser changes; enables Columns with `columnState`. |
| `defaultTab` | `RulesEditorTab` | `"highlights"` | Initial tab. |
| `labels` | `Partial<RulesEditorLabels>` | `DEFAULT_RULES_EDITOR_LABELS` | Label overrides. |
| `className` | `string` | Omitted | Outer region classes. |

### It produces rules and keeps nothing

Each edit emits a new `GridRules` and edited list; untouched lists and unchanged rules retain their references. Accept the result into `rules` and share it with the grid for immediate updates. For a save step, keep a draft separate from the applied rules. The JSON shape can live in a preferences envelope, file, or server.

Replace changed arrays and objects: the editor and grid memoize by reference. The editor retains transient tab, drag, and comma-field state, preserving unfinished text such as `ALPHA,` while emitting parsed values.

### A rule as it is typed

Each highlight or filter has column, operator, and value controls. `opsFor` offers comparisons/ranges for `column.numeric`, text matching otherwise, and equality, sets, and null checks for both.

| Operators | Fields |
|---|---|
| `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith` | One `value` |
| `between` | Two `values`: inclusive low/high |
| `in` | Comma-separated `values` |
| `isNull`, `notNull` | None |

`withOp` preserves values for the same field shape (`gt` to `lt`) and clears them otherwise (`gt` to `between`). `withColumn` keeps the condition if the new column offers its operator; otherwise it selects the first operator and drops values, even if the shape is unchanged.

Values stay as typed strings, read through the column's `parse` or numerically for numeric columns without a parser. A 32nds parser accepts `100-00`. The set field trims items and drops empties, with no quoting or escaping: enter `1000000`, not `1,000,000`, for one numeric member.

### Errors

`ruleProblem` reports missing columns/values and unreadable values below highlights and filters without blocking edits or evaluation. An unreadable single numeric value matches nothing; a mixed valid/invalid `in` set can match valid members. Empty text can match despite a missing-value message.

A missing column gives an individual match count of zero, but combined filtering skips that rule. Sort rows also report missing columns, which the comparator skips.

### Highlights

Highlights add a tone swatch, a target (`"cell"` by default or `"row"`), and a label for the grid's accessible description and chooser badge. Blank labels fall back to `describeRule`. Tones are `up`, `down`, `flat`, `stale`, `expiring`, `primary`, and `destructive`.

`Add highlight` appends `newHighlight(columns)`. The grid evaluates cell and row rules separately: the first matching cell rule for a column wins for that cell; the first matching row rule wins for the row. Reorder to change precedence.

### Filters and the count

`Add filter` appends `newFilter(columns)`. Every filter on a known column must match; filter order does not affect that requirement.

With `store`, highlights and filters show independent match counts across all store rows, including hidden rows and highlights that lose precedence. The Filters total reports combined rule matches out of all store ids, excluding any separate grid filter or custom view.

Counts recompute on mount and changes to their rule lists, columns, or store. Store notifications schedule updates at most once per 250 ms; edits are not throttled. Without `store`, match counts and the total disappear. Tab badges still show nonzero rule counts or `columnState.hidden.length`.

### Sort

Each sort key has a column and direction. The first key distinguishing two rows decides their order; reorder to change precedence. `Add sort key` appends `newSort(columns, rules.sort)`. Duplicates are allowed.

For the grid's own view, the rule stack breaks header-sort ties. A caller-supplied `view` owns filtering and sorting instead.

### Helpers

Import these from `@/components/ui/rules-editor`. Rule types, `opsFor`, `ruleProblem`, and `describeRule` come from [`grid-rules`](grid-rules.md). Here `columns` means `readonly ColumnDef<T>[]`, `condition` means `RuleCondition`, and `op` means `RuleOp`.

| Helper | Return type | Behavior |
|---|---|---|
| `valueShape(op)` | `"one" \| "two" \| "many" \| "none"` | Shape in the operator table. |
| `parseValues(text: string)` | `RuleValue[]` | Comma-separated, trimmed, nonempty strings. |
| `valuesText(values: readonly RuleValue[] \| undefined)` | `string` | Joins with `", "`; `null` becomes empty text, `undefined` gives `""`. |
| `withOp(condition, op)` | `RuleCondition` | Copies for the same shape; otherwise returns `{ op }`. |
| `withColumn(condition, column: ColumnDef<T> \| undefined)` | `RuleCondition` | Same condition if supported; otherwise only the first operator. |
| `moveItem<X>(list: readonly X[], from: number, to: number)` | `X[]` | Moves by index; equal/out-of-bounds indices return an unchanged copy. |
| `newRuleId()` | `string` | Timestamp plus module-local counter. |
| `newHighlight(columns)` | `ColumnRule` | First column/operator, fresh id, tone `"up"`. |
| `newFilter(columns)` | `FilterRule` | First column/operator. |
| `newSort(columns, existing: readonly SortRule[] = [])` | `SortRule` | First unused column, or first column if exhausted; `dir: "asc"`. |

With no columns, add buttons remain enabled and helpers use an empty key; highlights/filters start with `eq`.

### Labels

`labels` covers the title, tabs, add/move/remove buttons, fields, target/direction choices, empty messages, drag hint, and counts (`{n}` matches; `{m}` total ids). The title names the outer region and tablist.

Fields use `<field>: <rule>`, such as `Value: Rich to the market`. Highlights use their nonblank label or tab name and number; filters/sorts use tab name and number.

Operator words use `RULE_OP_LABELS`. Tone names, errors, and the embedded chooser's labels are not overridden by `labels`.

### What it does not do

The editor emits rules and evaluates counts; the grid applies the rules to its display. The caller supplies row values, accepts changes, and decides where to persist them.

### Tokens

The install adds the grid's `up`, `down`, `flat`, `stale`, and `expiring` tokens with their soft variants if missing. Tone swatches and chooser badges use them; `primary` and `destructive` use the host theme's tokens.
