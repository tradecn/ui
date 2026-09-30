import { useMemo, useRef, useState } from "react"
import { DataGrid, EMPTY_COLUMN_STATE, type ColumnDef, type SortState } from "@/components/ui/data-grid"
import { createRowStore } from "@/lib/row-store"
import DataGridDefaultsDemo from "./recipes/data-grid-defaults"
import DataGridSharedDefaultsDemo from "./recipes/data-grid-shared-defaults"

interface Row {
  id: string
  px: number
}

// A tape: 50 rows and a button that appends 10 more at the tail, with a total under them.
const footer = { px: (rows: Row[]) => String(rows.reduce((sum, r) => sum + r.px, 0)) }

export function DataGridScene() {
  const store = useMemo(() => {
    const s = createRowStore<Row>({ getRowId: (r) => r.id })
    s.applyDeltas({ upsert: Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, px: 100 + i })) })
    return s
  }, [])
  const next = useRef(50)
  const append = () => {
    const from = next.current
    next.current += 10
    store.applyDeltas({ upsert: Array.from({ length: 10 }, (_, i) => ({ id: `r${from + i}`, px: 100 + from + i })) })
  }
  return (
    <div className="flex flex-col gap-1">
      <div style={{ height: 200 }}>
        <DataGrid store={store} preset="tape" label="Smoke" footer={footer} columns={[{ key: "id", header: "Id", width: 80, accessor: (r) => r.id }, { key: "px", header: "Px", width: 80, numeric: true, accessor: (r) => r.px }]} />
      </div>
      <button type="button" onClick={append}>
        append 10
      </button>
      <div data-grid-recipe="defaults"><DataGridDefaultsDemo /></div>
      <div data-grid-recipe="shared-defaults"><DataGridSharedDefaultsDemo /></div>
      <GridKeyboardScene />
    </div>
  )
}

const keyboardColumns: ColumnDef<Row>[] = [
  { key: "id", header: "Quote", width: 80, accessor: row => row.id },
  { key: "px", header: "Price", width: 100, numeric: true, sortable: true, accessor: row => row.px },
  { key: "note", header: "Note", width: 160, accessor: () => "", cell: ({ rowId }) => <input aria-label={`Note for ${rowId}`} className="min-w-0 w-full" /> },
]

function GridKeyboardScene() {
  const [store] = useState(() => {
    const store = createRowStore<Row>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "Alpha", px: 100 }, { id: "Beta", px: 101 }] })
    return store
  })
  const [focused, setFocused] = useState<string | null>("Beta")
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set(["Beta"]))
  const [activated, setActivated] = useState(0)
  const [columns, setColumns] = useState(EMPTY_COLUMN_STATE)
  const [sort, setSort] = useState<SortState>(null)
  const [handled, setHandled] = useState(false)
  return <div data-grid-keyboard data-focused-row={focused} data-selection={[...selection].join(",")} data-activated={activated} data-sort={sort ? `${sort.key}:${sort.dir}` : "none"} className="flex flex-col gap-1" onKeyDownCapture={event => { if (handled) event.preventDefault() }}>
    <div className="h-40">
      <DataGrid store={store} columns={keyboardColumns} label="Keyboard quotes" selectionColumn selection={selection} onSelectionChange={setSelection} focusedRowId={focused} onFocusedRowChange={setFocused} onRowActivate={() => setActivated(count => count + 1)} columnState={columns} onColumnStateChange={setColumns} sort={sort} onSortChange={setSort} />
    </div>
    <label><input type="checkbox" checked={handled} onChange={event => setHandled(event.target.checked)} /> Handle keys in capture</label>
    <button type="button" onClick={() => setColumns(state => ({ ...state, hidden: state.hidden.length ? [] : ["px"] }))}>Toggle price</button>
  </div>
}
