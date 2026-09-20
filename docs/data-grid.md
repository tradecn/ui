# data-grid

`npx shadcn add tradecn/ui/data-grid` puts `data-grid.tsx` in your `ui` alias and brings `row-store`, `use-flash`, and `format` with it, plus your own `checkbox`, `context-menu`, and `dropdown-menu` if you do not have them. Dependencies: `cn`, `@tanstack/react-virtual`.

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

## How it stays inside the frame

Rows subscribe to their own store entry through `useRow`. A delta to one row re-renders that row and nothing else; the header, the body, and the other rows do not run. A batch that touches two thousand rows is one commit over the rows that changed. Numeric cells flash by direction through one shared flash memory keyed by row and column, so a row that scrolls out of view and back resumes its flash where it was.

Rows have a fixed height (from the preset, or `rowHeight`) and are positioned by TanStack Virtual. That is a requirement, not a limit: it is what makes `pinViewport` exact. When rows arrive above the first visible row, the grid moves `scrollTop` by exactly that many row heights and the trader's view does not jump.

## Presets

`blotter` (24px, multi-select, fill flash, hold 750 ms, new rows highlighted and pinned), `watchlist` (22px, single-select, fill), `rfq` (26px, single-select, ring flash, hold 1 s, new rows highlighted and pinned, row count announced), `option-chain` (20px, no selection, ring). Every preset value is a prop you can override.

## The reorder hold

With `sort` (or a `view` of your own) rows can move as values change. After any key or pointer interaction the grid calls `view.touch()`, and for `reorderHoldMs` the order freezes: new rows append, removed rows vanish, nothing moves under the cursor. When the hold lapses the grid settles to the sort. Pass your own `view` when the order is a rule you own (a desk's prioritization); the grid then leaves sorting to you.

## Identity

Selection, focus, and the context menu are all row ids. Indices are derived per render. `aria-activedescendant` names the focused row; `aria-rowindex` is the view index plus two; the live region says "1,024 rows, 12 new" at most once a second.

## Keyboard

Up and Down move focus (Shift extends the selection in multi mode), PageUp and PageDown by a screen, Home and End to the ends. Space toggles selection, Enter activates, Escape clears, Ctrl or Cmd+A selects all. Left and Right move the focused column; Alt+Left/Right moves that column, Alt+Shift+Left/Right resizes it by 8px, Alt+S cycles its sort, Alt+H hides it. Shift+F10 or the menu key opens the context menu on the focused row. Every header has a menu (sort, move, hide, reset) and a drag handle to resize.

## What it does not do

Fetching, grouping, tree rows, inline editing, variable row height, column filters, local storage. Column state comes back through `onColumnStateChange` for you to keep; the grid does not know where.
