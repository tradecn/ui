# data-grid

A virtualized grid fed by a row store one row at a time: a delta re-renders one row, and nothing else runs.

## Usage

```tsx
import { DataGrid, type ColumnDef } from "@/components/ui/data-grid"
import { createRowStore } from "@/lib/row-store"
```

```tsx
const store = createRowStore<Rfq>({ getRowId: (r) => r.id, lane: "ordered" })

<DataGrid
  store={store}
  preset="rfq"
  label="Open RFQs"
  columns={[
    { key: "client", header: "Client", width: 140, frozen: "left", sortable: true, accessor: (r) => r.client },
    { key: "px", header: "Price", width: 100, numeric: true, accessor: (r) => r.px, format: (v) => ust.price(v as number) },
    { key: "timeLeft", header: "Time", width: 80, numeric: true, accessor: (r) => r.secondsLeft },
  ]}
  onRowActivate={(rfq) => openTicket(rfq)}
  renderContextMenu={(rows) => <ContextMenuItem onClick={() => quote(rows)}>Quote</ContextMenuItem>}
/>
```

## API Reference

### How it stays inside the frame

Rows subscribe to their own store entry through `useRow`. A delta to one row re-renders that row and nothing else; the header, the body, and the other rows do not run. A batch that touches two thousand rows is one commit over the rows that changed. Numeric cells flash by direction through one shared flash memory keyed by row and column, so a row that scrolls out of view and back resumes its flash where it was. The flash draws from the `up`, `down`, and `flat` tokens, and the rule tones below from those plus `stale` and `expiring`, all added to your stylesheet if you do not have them.

A `numeric` column is right-aligned and set in lining, tabular figures in the numeric family, `--tradecn-font-numeric`, and its cells carry `data-numeric`. Give a column of fraction quotes `font: "mono"` so `99-16+` over `99-17` keeps its dash and its tail in one place; [`typography.md`](typography.md) says why, and `numericFontClass` in [`format`](format.md) makes the same choice from a convention.

Rows have a fixed height (from the preset, or `rowHeight`) and are positioned by TanStack Virtual. That is a requirement, not a limit: it is what makes `pinViewport` exact. When rows arrive above the first visible row, the grid moves `scrollTop` by exactly that many row heights and the trader's view does not jump.

### Presets

`blotter` (24px, multi-select, fill flash, hold 750 ms, new rows highlighted and pinned), `watchlist` (22px, single-select, fill), `rfq` (26px, single-select, ring flash, hold 1 s, new rows highlighted and pinned, row count announced), `option-chain` (20px, no selection, ring). Every preset value is a prop you can override. [`watchlist`](watchlist.md) and [`blotter`](blotter.md) are items built on the first two.

### The reorder hold

With `sort` (or a `view` of your own) rows can move as values change. After any key or pointer interaction the grid calls `view.touch()`, and for `reorderHoldMs` the order freezes: new rows append, removed rows vanish, nothing moves under the cursor. When the hold lapses the grid settles to the sort. Pass your own `view` when the order is a rule you own (a desk's prioritization); the grid then leaves sorting to you.

### Rules as data

`rules` takes a `GridRules` object from [`grid-rules`](grid-rules.md), installed alongside: `columns` colors cells and rows, `filter` keeps rows, and `sort` orders them, all as plain objects a desk writes without a build. The grid wires them itself. A header sort comes first and the rules' order breaks its ties. Every filter rule has to hold, along with your own `filter`. A cell with a matched rule carries `data-rule`, `data-tone`, and the rule's words in its accessible description, and a row rule marks the row the same way, under whatever `getRowProps` says. A value in a rule is typed in the column's format and read through the column's `parse`, so give a price column `parse: (text) => parsePrice(text, convention)`. With a `view` of your own the grid ignores `rules.filter` and `rules.sort`, as it ignores `filter`, since the view's membership and order are yours; `rules.columns` still apply. Keep the object's identity stable between renders, as with `filter`: a new object is a new view.

### Identity

Selection, focus, and the context menu are all row ids. Indices are derived per render. `aria-activedescendant` names the focused row; `aria-rowindex` is the view index plus two; the live region says "1,024 rows, 12 new" at most once a second.

### Keyboard

Up and Down move focus (Shift extends the selection in multi mode), PageUp and PageDown by a screen, Home and End to the ends. Space toggles selection, Enter activates, Escape clears, Ctrl or Cmd+A selects all. Left and Right move the focused column; Alt+Left/Right moves that column, Alt+Shift+Left/Right resizes it by 8px, Alt+S cycles its sort, Alt+H hides it. Shift+F10 or the menu key opens the context menu on the focused row. Every header has a menu (sort, move, hide, reset) and a drag handle to resize.

### What it does not do

Fetching, grouping, tree rows, inline editing, variable row height, local storage. Column state comes back through `onColumnStateChange` for you to keep, and rules go in as data; the grid does not know where either lives.
