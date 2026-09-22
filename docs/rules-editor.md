# rules-editor

The editor over one grid's rules: highlights, filters, and the sort stack as lists to add to, edit, reorder, and remove, with a live count of the rows each rule matches, and the column chooser in a fourth tab.

## Usage

```tsx
import { RulesEditor } from "@/components/ui/rules-editor"
import type { GridRules } from "@/lib/grid-rules"
```

```tsx
const [rules, setRules] = useState<GridRules>({ columns: [], filter: [], sort: [] })
const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })

<RulesEditor columns={columns} rules={rules} onRulesChange={setRules} store={store} columnState={columnState} onColumnStateChange={setColumnState} />
<DataGrid store={store} columns={columns} rules={rules} columnState={columnState} onColumnStateChange={setColumnState} label="Open RFQs" />
```

## Composition

Four tabs, a `tablist` the arrow keys walk. Highlights is the `columns` list of a [`grid-rules`](grid-rules.md) object, Filters its `filter`, Sort its `sort`, and Columns is [`column-chooser`](column-chooser.md)'s panel over the same grid, there whenever `columnState` and `onColumnStateChange` are given. Each list is the same frame: a row per rule with a drag handle, `Move up`, `Move down`, and `Remove`, and an add button under it. `defaultTab` opens on one of them.

## API Reference

### It produces rules and keeps nothing

Every field shows what `rules` holds, and every edit is a new `GridRules` through `onRulesChange`, the untouched lists carried over by reference. Hand the same object to the grid's `rules` and the grid follows each keystroke; a desk that wants a save step keeps a draft between the two. Where the rules live afterwards, a preferences envelope, a file, a server, is yours, and the shape is JSON so they travel.

### A rule as it is typed

A row is a column picker, an op picker, and the value the op wants. The op picker narrows by the column's kind: comparisons and a range for a numeric column, text matching for the rest, from `opsFor`. Change the column and an op the new column does not offer becomes its first; change the op and a typed value stays when the new op wants the same shape (`gt` to `lt`) and goes when it does not (`gt` to `between`), through `withColumn` and `withOp`. A range has two fields, low and high. A set has one field, comma separated, read by `parseValues`. `isNull` and `notNull` have none. The value is stored as typed, in the column's own format, so a price on a 32nds column reads `100-00`; a value the column cannot read is said under the row through `ruleProblem`, and matches nothing until it is fixed.

### Highlights

A highlight adds a tone, shown beside its picker in the token itself, what it paints (the cell in its column, or the row), and a label, the words a screen reader hears and the chooser prints. `Add highlight` appends one on the first column with a fresh id from `newRuleId`. The first rule in the list that matches a cell wins, so the order is the ranking, and the list reorders by drag, by Alt with an arrow on a focused row, and by the buttons.

### Filters and the count

Beside every highlight and every filter a count says how many rows in `store` it matches right now, and under the filters how many rows show under all of them together. The counts run on a throttled beat, at most four times a second however fast the feed, so a busy store does not redraw the editor every frame. Without a `store` there are no counts.

### Sort

A sort key is a column and a direction. The first key that tells two rows apart decides, so the stack's order is the sort's precedence; drag or move to change it. `Add sort key` picks the first column not yet in the stack.

### Labels

Every word is in `labels`, a partial of `DEFAULT_RULES_EDITOR_LABELS`: the title, the four tabs, the add buttons, each field's name, the words for the cell and the row and the two directions, the count templates (`{n}` and `{m}`), the empty lines, and the drag hint. Each field is named `<field>: <rule>`, the rule by its label or by its tab and number, so a test or a screen reader finds `Value: Rich to the market`.

### What it does not do

It does not apply the rules, keep them, or decide a value. The grid applies them from its `rules` prop; the store's rows are what the counts read.

### Tokens

The install adds the grid's tokens, `up`, `down`, `flat`, `stale`, and `expiring` with their soft variants, if you do not have them; the tone swatches and the chooser's rule badges draw from them.
