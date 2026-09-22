# ColumnChooser

The dialog over one grid's columns: show and hide, reorder by drag or by keyboard, reset a width, find one, all through the grid's own column state.

## Usage

```tsx
import { ColumnChooser } from "@/components/ui/column-chooser"
import { DataGrid, type ColumnState } from "@/components/ui/data-grid"
```

```tsx
const [columnState, setColumnState] = useState<ColumnState>({ order: [], widths: {}, hidden: [] })
const [open, setOpen] = useState(false)

<Button onClick={() => setOpen(true)}>Columns</Button>
<ColumnChooser open={open} onOpenChange={setOpen} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} rules={rules.columns} />
<DataGrid store={store} columns={columns} columnState={columnState} onColumnStateChange={setColumnState} rules={rules} label="Open RFQs" />
```

## Composition

`ColumnChooser` is the panel in your `dialog`, under a title and a line of description, closing on Escape and on the overlay. `ColumnChooserPanel` is the same list with no dialog around it, for a sheet, a settings page, or a tab of your own; [`rules-editor`](rules-editor.md) puts it in one. Both take the same props. Give either the grid's `columns`, its `columnState`, and its `onColumnStateChange`, the three the grid already has, and the two agree on every change.

## API Reference

### The grid's state is the only state

The chooser keeps nothing. Every row is derived from `columns` and `columnState` on each render, `chooserRows(columns, columnState, rules)`, in the order the grid shows them: frozen columns first, then the rest by the state's `order`, a hidden column in its place so it comes back where it was. Every change is a new `ColumnState` handed to `onColumnStateChange`, the same call the grid's own header menus make, so the grid and the chooser can never disagree, and where the state lives, a panel's state, a preferences envelope, a file, stays yours. A column hidden in its definition (`hidden: true` on the `ColumnDef`) is not listed. That is a decision in code, not one for this surface.

### Show and hide

Each row is a checkbox named `Show <column>`. Unchecking writes the key into `hidden`; checking takes it out. The count of hidden columns is printed above the list, and `Reset all` hands the grid the empty state, order, widths, and hidden alike, as the header menu's `Reset columns` does. It is disabled while the state is already the default, `isDefaultColumnState`.

### Reorder

Drag a row onto another and it takes that place, the rest shifting to make room. With a row focused, Alt and an arrow key move it one place, and each row has `Move up` and `Move down` for a pointer or a screen reader. A frozen column stays on its side of the line: the grid leads with frozen columns whatever the order says, so a move across the line would change nothing and the chooser refuses it, and the buttons at the ends of a side are disabled. The whole order is written on every move, `moveColumnTo` and `moveColumnBy`, so nothing depends on what the state held before.

### Widths

Each row prints the width in force, the state's if it has one, else the column's own, in the numeric class. Where the state holds a width, `Reset width` appears and forgets it, `resetColumnWidth`, so the column's own width is in force again. There is no width field: the grid's header is where a column is sized, by drag or by Alt+Shift with an arrow.

### Rules in words

Pass `rules`, the `columns` list of a [`grid-rules`](grid-rules.md) object, and each rule is said beside the column it names, as its label or as `describeRule`'s words, painted in its tone. A trader reading the chooser learns which columns carry a highlight without the color, and which highlight a hidden column would show if it were shown.

### A dialog is a wall

Focus inside the dialog runs only the scopes declared inside it, as every dialog does under [`use-hotkeys`](use-hotkeys.md). Typing a column's name into the search box cannot fire a grid's single-key bindings underneath.

### Labels

Every word is in `labels`, a partial of `DEFAULT_COLUMN_CHOOSER_LABELS`: the title, the description, the search box, the `Show` prefix, the `frozen` and `hidden` words, the width and its reset, the moves, `Reset all`, the empty line, and the drag hint. The panel is a `group` named by the title; each row is named by its column.

### What it does not do

It does not add a column, size one, or keep the state anywhere. Which columns exist is the `columns` list; how wide one is set is the grid's header; where the state goes is yours.

### Tokens

The install adds the grid's tokens, `up`, `down`, `flat`, `stale`, and `expiring` with their soft variants, if you do not have them; the rule badges draw from them.
