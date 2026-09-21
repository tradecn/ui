# blotter

`npx shadcn add tradecn/ui/blotter` puts `blotter.tsx` and `data-grid.tsx` in your `ui` alias, brings `row-store`, `use-row-store`, `use-flash`, and `format` with them, and your own `button`, `context-menu`, `checkbox`, and `dropdown-menu` if you do not have them. Dependencies: `cn`, `@tanstack/react-virtual`. If you already installed `data-grid` or `watchlist`, the shared files are byte-identical and nothing of yours changes.

```tsx
const store = createRowStore<BlotterRow>({ getRowId: (o) => o.id, lane: "ordered" })

<Blotter
  store={store}
  sort={{ key: "time", dir: "desc" }}
  price={(value, order) => conventions[order.symbol].price(value)}
  onNew={() => openTicket()}
  actions={[
    { id: "cancel", label: "Cancel", destructive: true, run: (orders) => api.cancel(orders.map((o) => o.id)) },
    { id: "amend", label: "Amend", run: ([order]) => openTicket(order) },
  ]}
/>
```

It is the data grid in its `blotter` preset (24 px rows, multi-select, a checkbox column, new rows highlighted and the viewport pinned when they arrive above you) with a set of columns, a button that starts an order, and actions on the orders in hand. Every `DataGrid` prop passes through except `preset`. Read `docs/data-grid.md` for sorting, the reorder hold, column state, and the keyboard.

## The status is the server's

`status` is a string and the blotter prints it as it arrives. It never works one out. An order that is 5,000 of 5,000 by the numbers still says `PartiallyFilled` until the server says something else, because the server may know about a bust, a correction, or a fill still in flight, and a screen that gets ahead of it is a screen that is sometimes wrong about money. A change of status flashes flat: something happened, and it has no direction.

## Actions are the server's too

Each order carries `allowedActions`, a list of action ids the server says may be done to it now. No list means nothing may. An action shows in the toolbar and in the right-click menu, and applies only to the orders that list its `id`.

The orders in hand are the selection, or the focused row when nothing is selected. With a mixed selection the button says exactly what it will do: `Cancel 3` when all three allow it, `Cancel 2 of 3` when one does not, and disabled when none do. `run(orders, ids)` gets only the ones that allow it. It does not act on a subset without saying so, and it does not refuse the whole selection because of one filled order.

The check is made twice. Once to draw the button, and again against the store as the click lands, because an order can fill between the two. The second one is the one that counts. The server is still the authority after that: `allowedActions` is what it said last, not a promise, and your `run` should expect a rejection.

The toolbar listens to the orders in hand for itself, so when a fill takes `cancel` away from one of them the count on the button changes, and the grid does not re-render to make that happen.

`allowedRows(store, ids, action)` is the same filter as a function, for a hotkey or a menu of your own.

## Delete cancels nothing by default

`deleteAction="cancel"` makes Delete and Backspace on the grid run that action on the orders in hand, through the same check. It is off unless you turn it on. A key that cancels orders is a decision for the people who trade on the screen, not a default. From the toolbar's buttons those keys do nothing.

## Columns

`blotterColumns({ price, time })` returns time, symbol, side, quantity, filled, price, status, and account. It is a plain list: spread it into your own to add a column, drop one, or reorder.

`price` gets the order, because instruments print differently, and defaults to two decimals. `time` defaults to local `HH:MM:SS`. A missing price, fill, or account prints the one null token from `format`. The side is the word `BUY` or `SELL`, colored with the `up` and `down` tokens; those tokens mean market direction everywhere else, and they are borrowed here because a blotter has always been read that way. The word is what says which side.

Filled and price flash on change. Quantity and time do not. Pass `sort` for newest first; the blotter does not pick an order for you.

Keep `columns`, `price`, and `time` stable (a module constant, or `useMemo`). Your `actions`, `renderContextMenu`, `onSelectionChange`, and `onFocusedRowChange` are read through a ref and can be inline.

## Adding

`onNew` puts a button in the toolbar (`newLabel`, "New order" by default). The blotter does not make orders. It tells you someone asked for one, and the order appears when your feed upserts it.

## What it does not do

Build or send an order, confirm a cancel, group by parent order, or total anything. A confirmation dialog belongs in your `run`. It has no notion of fills as rows of their own; that is a second blotter over a second store.
