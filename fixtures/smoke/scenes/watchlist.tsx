import { useState } from "react"
import { createPortal } from "react-dom"
import { Watchlist, WatchlistGrid, WatchlistAddForm, WatchlistAddInput, WatchlistAddButton, WatchlistRemoveMenuItem, watchlistColumns, watchlistRemoveColumn, type WatchlistRow } from "@/components/ui/watchlist"
import { createRowStore } from "@/lib/row-store"

const columns = [...watchlistColumns(), watchlistRemoveColumn()]

const ROWS: WatchlistRow[] = [
  { symbol: "ZN", last: 110.5, bid: 110.46875, ask: 110.53125, change: 0.25, changePct: 0.23, volume: 1_250_000 },
  { symbol: "ES", last: 5012.25, bid: 5012, ask: 5012.5, change: -12.5, changePct: -0.25, volume: 980_000 },
]

export function WatchlistScene() {
  const [keyboard, setKeyboard] = useState(false)
  const [store] = useState(() => {
    const s = createRowStore<WatchlistRow>({ getRowId: (r) => r.symbol })
    s.applyDeltas({ upsert: ROWS })
    return s
  })
  if (keyboard) return <WatchlistKeyboardScene />
  return (
    <div style={{ width: 640 }}>
      <button onClick={() => setKeyboard(true)}>Keyboard controls</button>
      <button onClick={() => { store.applyDeltas({ remove: store.getIds(), upsert: Array.from({ length: 500 }, (_, i) => ({ symbol: `SYM${i}`, last: i })) }) }}>Load 500 quotes</button>
      <div style={{ height: 160 }}>
        <Watchlist store={store} onAdd={(symbol) => store.applyDeltas({ upsert: [{ symbol, last: 1 }] })} onRemove={(symbols) => store.applyDeltas({ remove: symbols })}>
          <WatchlistAddForm><WatchlistAddInput /><WatchlistAddButton /></WatchlistAddForm>
          <div className="h-32"><WatchlistGrid columns={columns} renderContextMenu={(_, ids) => <WatchlistRemoveMenuItem ids={ids} />} /></div>
        </Watchlist>
      </div>
    </div>
  )
}

const editableColumns = [
  ...watchlistColumns().slice(0, 1),
  { key: "last", header: "Last", width: 90, accessor: (row: WatchlistRow) => row.last, edit: { parse: (text: string) => Number(text) } },
  { key: "note", header: "Note", width: 260, accessor: () => "", cell: ({ row }: { row: WatchlistRow }) => <>
    <input aria-label={`${row.symbol} note`} defaultValue="ABC" className="w-20 border" />
    <div role="grid" aria-label={`${row.symbol} nested grid`} tabIndex={0}><div role="row"><div role="gridcell">Nested</div></div></div>
    {row.symbol === "ZN" && createPortal(<div role="grid" aria-label="Portaled quotes" tabIndex={0}><div role="row"><div role="gridcell">Portaled quotes</div></div></div>, document.body)}
  </> },
]

function WatchlistKeyboardScene() {
  const [store] = useState(() => {
    const value = createRowStore<WatchlistRow>({ getRowId: row => row.symbol })
    value.applyDeltas({ upsert: ROWS })
    return value
  })
  const [requests, setRequests] = useState<string[][]>([])
  const [cancel, setCancel] = useState(false)
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set())
  const [focused, setFocused] = useState<string | null>(null)
  return <div className="w-full max-w-2xl">
    <label><input type="checkbox" checked={cancel} onChange={event => setCancel(event.target.checked)} />Cancel deletion keys</label>
    <button onClick={() => {
      store.applyDeltas({ remove: store.getIds() })
      setSelection(new Set())
      setFocused(null)
    }}>Clear quotes</button>
    <output aria-label="Removal requests">{JSON.stringify(requests)}</output>
    <div className="h-40"><Watchlist store={store} selection={selection} onSelectionChange={setSelection} focusedRowId={focused} onFocusedRowChange={setFocused} onRemove={ids => setRequests(previous => [...previous, ids])}>
      <WatchlistGrid columns={editableColumns} label="Editable watchlist" selectionMode="multi" selectionColumn onKeyDown={event => {
        if (cancel && (event.key === "Delete" || event.key === "Backspace")) event.preventDefault()
      }} onEdit={({ rowId, value }) => store.applyDeltas({ patch: [{ id: rowId, fields: { last: Number(value) } }] })} />
    </Watchlist></div>
  </div>
}
