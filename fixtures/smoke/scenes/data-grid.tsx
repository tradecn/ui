import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import { flushSync } from "react-dom"
import { DataGrid, EMPTY_COLUMN_STATE, type CellEditHandle, type ColumnDef, type EditChange, type SortState } from "@/components/ui/data-grid"
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
      <GridEditorScene />
      <GridDelayedEditorScene />
      <GridLayoutEditorScene />
    </div>
  )
}

const editorColumns: ColumnDef<Row>[] = [
  { key: "id", header: "Quote", width: 100, accessor: row => row.id },
  { key: "px", header: "Price", width: 100, numeric: true, accessor: row => row.px, edit: { parse: text => Number(text) } },
]

function GridEditorScene() {
  const [store] = useState(() => {
    const store = createRowStore<Row>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "Alpha", px: 100 }, { id: "Beta", px: 101 }] })
    return store
  })
  const [missing, setMissing] = useState<"visible" | "hidden" | "removed">("visible")
  const [sent, setSent] = useState<EditChange<Row>[]>([])
  const columns = useMemo(() => missing === "removed" ? editorColumns.filter(column => column.key !== "px") : editorColumns, [missing])
  const columnState = useMemo(() => ({ ...EMPTY_COLUMN_STATE, hidden: missing === "hidden" ? ["px"] : [] }), [missing])
  return <div data-grid-editor data-sent={sent.length} className="flex flex-col gap-1" onKeyDownCapture={event => {
    if (event.key !== "F8" && event.key !== "F9") return
    event.preventDefault()
    const next = event.key === "F8" ? "hidden" : "removed"
    if (event.shiftKey) {
      flushSync(() => setMissing(next))
      flushSync(() => setMissing("visible"))
    } else setMissing(next)
  }}>
    <div className="h-40"><DataGrid store={store} columns={columns} columnState={columnState} label="Editable quotes" focusedRowId="Beta" onEdit={change => setSent(previous => [...previous, change])} /></div>
    <input aria-label="Outside editor target" />
    <button type="button" onClick={() => setMissing("visible")}>Restore editor column</button>
    <button type="button" onClick={() => {
      const last = sent.at(-1)
      if (last) store.applyDeltas({ patch: [{ id: last.rowId, fields: { px: Number(last.value) } }] })
    }}>Accept edited price</button>
  </div>
}

function GridDelayedEditorScene() {
  const [store] = useState(() => {
    const store = createRowStore<Row>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "Alpha", px: 100 }] })
    return store
  })
  const [missing, setMissing] = useState<"visible" | "state" | "definition">("visible")
  const [waiting, setWaiting] = useState(false)
  const [sent, setSent] = useState(0)
  const resume = useRef<(() => void) | null>(null)
  const columns = useMemo<ColumnDef<Row>[]>(() => editorColumns.map(column => column.key === "px" ? {
    ...column,
    hidden: missing === "definition",
    cell: ({ edit }) => <button type="button" onClick={async () => {
      if (resume.current) return
      setWaiting(true)
      await new Promise<void>(resolve => { resume.current = resolve })
      edit?.open()
      setWaiting(false)
    }}>Request price editor</button>,
  } : column), [missing])
  const columnState = useMemo(() => ({ ...EMPTY_COLUMN_STATE, hidden: missing === "state" ? ["px"] : [] }), [missing])
  return <div data-grid-delayed-editor data-waiting={waiting} data-sent={sent} className="flex flex-col gap-1">
    <div className="h-40"><DataGrid store={store} columns={columns} columnState={columnState} label="Delayed quotes" onEdit={() => setSent(count => count + 1)} /></div>
    <input aria-label="Outside delayed editor" />
    <button type="button" onClick={() => setMissing("state")}>Hide price in state</button>
    <button type="button" onClick={() => setMissing("definition")}>Hide price in definition</button>
    <button type="button" onClick={() => { resume.current?.(); resume.current = null }}>Resolve price editor</button>
    <button type="button" onClick={() => setMissing("visible")}>Restore delayed price</button>
  </div>
}

function GridLayoutCell({ edit, requestedRef, value }: { edit: CellEditHandle | undefined; requestedRef: RefObject<boolean>; value: unknown }) {
  useLayoutEffect(() => {
    if (!requestedRef.current || !edit) return
    requestedRef.current = false
    edit.open()
  })
  return <span>{String(value)}</span>
}

function GridLayoutEditorScene() {
  const [store] = useState(() => {
    const store = createRowStore<Row>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "Alpha", px: 100 }] })
    return store
  })
  const [missing, setMissing] = useState<"visible" | "removed" | "read-only" | "toggle">("visible")
  const [sent, setSent] = useState(0)
  const requestedRef = useRef(false)
  const columns = useMemo<ColumnDef<Row>[]>(() => editorColumns.filter(column => column.key !== "px" || missing !== "removed").map(column => column.key === "px" ? {
    ...column,
    edit: missing === "read-only" ? undefined : missing === "toggle" ? { parse: Number, toggle: value => !value } : column.edit,
    cell: ({ edit, value }) => <GridLayoutCell edit={edit} value={value} requestedRef={requestedRef} />,
  } : column), [missing])
  return <div data-grid-layout-editor data-sent={sent} className="flex flex-col gap-1">
    <div className="h-40"><DataGrid store={store} columns={columns} label="Layout quotes" onEdit={() => setSent(count => count + 1)} /></div>
    <button type="button" onClick={() => setMissing("removed")}>Remove custom column</button>
    <button type="button" onClick={() => setMissing("read-only")}>Make custom column read-only</button>
    <button type="button" onClick={() => setMissing("toggle")}>Make custom column a toggle</button>
    <button type="button" onClick={() => { requestedRef.current = true; setMissing("visible") }}>Restore custom editor</button>
  </div>
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
