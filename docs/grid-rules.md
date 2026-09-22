# grid-rules

Rules as data for a grid: which cells to color, which rows to show, and the order, as plain objects a desk writes without a build.

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

A rule names a column by its key and reads a row through that column's own `accessor`, so it sees what the cell sees. A `ColumnRule` (`id`, `column`, `when`, `tone`, `label`, `target`) colors the cell in its column when `when` holds, or the whole row with `target: "row"`. A `FilterRule` (`column`, `op`, `value`, `values`) keeps a row when it holds, and every filter rule has to hold. A `SortRule` (`key`, `dir`) orders, and the first rule that tells two rows apart decides. `GridRules` is the three lists together, `columns`, `filter`, and `sort`. The ops are `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `between` (two `values`, low then high, both inclusive), `in` (any number of `values`), `contains`, `startsWith`, `isNull`, and `notNull`. Text compares without regard to case. A cell with no value answers only `isNull` and `notNull`: it is never above, below, or unequal to anything, so a missing price is not "below 99" and is not "not 99" either. `RULE_OP_LABELS` has the word for each op, `opsFor(column)` the ops a column offers (comparisons and ranges for a numeric one, text matching for the rest), and `describeRule(rule, columns)` says a rule in words: `Price above 99-16+`, `Client one of ALPHA, BETA`, `Status is empty`.

### Values are typed in the column's format

A value in a rule is what someone typed. A string is read through the column's `parse`, so a price rule on a 32nds column is written `99-16+` and a size `5,000,000`; a numeric column with no `parse` reads a number, and any other column keeps the text. A number or a boolean is used as it is. `readRuleValue(column, value)` is that reading. It returns null for text the column cannot read, and null matches nothing, so a typo hides no rows and colors no cells. `ruleProblem(rule, columns)` says why in a sentence, for an editor to show under the rule. Give a column a `parse` wherever its format is not a plain number: `parse: (text) => parsePrice(text, convention)` on a price column, `parse: (text) => text === "yes"` on a boolean one. [`data-grid`](data-grid.md)'s `ColumnDef` carries it.

### Tones are tokens

A tone is a token name, `up`, `down`, `flat`, `stale`, `expiring`, `primary`, or `destructive`, never a literal color, so a rule reads the same under every theme. The text takes the token and the background a tint of its soft variant, painted as a background image so it layers over whatever color the element already has: a frozen cell keeps its opaque background under the tint, and a selected row's highlight shows through. `RULE_TONE_CLASS` has the class for each tone and `RULE_TONES` the list. Direction never rides on hue alone: an applied rule sets `data-rule` to the rule's id and `data-tone` to its tone on the element, and puts the rule's `label`, or `describeRule`'s words when there is none, in the element's accessible description, so a test reads it and a screen reader hears it.

### Compiling

`compileFilter(rules, columns)` returns a `(row) => boolean`, `compileComparator(rules, columns)` a comparator with a null last whichever way a rule runs, and `applyRules(rules, columns)` the decorations: `cell(columnKey, row)` and `getRowProps(row)`, each answering with the first matching rule's `data-rule`, `data-tone`, `aria-description`, and `className`, or undefined, plus `byColumn`, the rules that apply keyed by column. Every typed value is read once, when the rule compiles, so what runs per row only compares. A rule on a column the grid does not have is skipped. `compareValues` and `compareDirected` are the comparisons underneath, nulls last, numbers numerically, everything else as text. The data grid does this wiring itself from its `rules` prop; the functions are here for a grid of your own, a `view` you build, or [`rfq-stack`](rfq-stack.md)'s `useRfqStackView`.

### What it does not do

It keeps no rules and decides no value. Where a desk's rules live, and who may change them, is yours; the shape is JSON so they travel.

### Tokens

The install adds the `up`, `down`, `flat`, `stale`, and `expiring` tokens with their soft variants, if you do not have them. `primary` and `destructive` are shadcn's own.
