import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { createPortal, flushSync } from "react-dom"
import { useView } from "@/hooks/use-row-store"
import { ContextMenuItem } from "@/components/ui/context-menu"
import { DataGrid, EMPTY_COLUMN_STATE, type CellEditHandle, type ColumnDef, type ColumnState, type EditChange, type SortState } from "@/components/ui/data-grid"
import { createRowStore, type RowView } from "@/lib/row-store"
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
      <GridPointerScene />
      <GridNestedPointerScene />
      <GridShadowPointerScene />
      <GridResizeScene />
      <GridEditorScene />
      <GridDelayedEditorScene />
      <GridLayoutEditorScene />
    </div>
  )
}

function GridPointerScene() {
  const [store] = useState(() => {
    const store = createRowStore<Row>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "Alpha", px: 100 }, { id: "Beta", px: 101 }] })
    return store
  })
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set(["Beta"]))
  const [focused, setFocused] = useState<string | null>("Beta")
  const [activated, setActivated] = useState(0)
  const [inspected, setInspected] = useState(0)
  const [nativeMenu, setNativeMenu] = useState("none")
  const [handled, setHandled] = useState(false)
  const columns = useMemo<ColumnDef<Row>[]>(() => [...editorColumns, {
    key: "note", header: "Note", width: 140, accessor: () => "",
    cell: ({ rowId }) => <input aria-label={`Pointer note for ${rowId}`} className="w-full min-w-0" onContextMenu={event => { const native = event.nativeEvent; queueMicrotask(() => setNativeMenu(native.defaultPrevented ? "prevented" : "available")) }} />,
  }, {
    key: "inspect", header: "Action", width: 120, accessor: () => "",
    cell: ({ rowId }) => <button type="button" aria-label={`Inspect pointer ${rowId}`} onClick={() => setInspected(count => count + 1)}>Inspect</button>,
  }], [])
  return <div data-grid-pointer data-selection={[...selection].join(",")} data-focused-row={focused} data-activated={activated} data-inspected={inspected} data-native-menu={nativeMenu} className="flex flex-col gap-1" onPointerDownCapture={event => { if (handled && (event.target as Element).closest('[data-col="id"]')) event.preventDefault() }}>
    <div className="h-40"><DataGrid store={store} columns={columns} label="Pointer quotes" selectionColumn selection={selection} onSelectionChange={setSelection} focusedRowId={focused} onFocusedRowChange={setFocused} onRowActivate={() => setActivated(count => count + 1)} onEdit={() => {}} renderContextMenu={(_rows, ids) => <ContextMenuItem>Pointer action: {ids.join(",")}</ContextMenuItem>} /></div>
    <label><input type="checkbox" checked={handled} onChange={event => setHandled(event.target.checked)} /> Handle pointer in capture</label>
  </div>
}

function GridNestedPointerScene() {
  const [store] = useState(() => {
    const store = createRowStore<Row>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "Alpha", px: 100 }, { id: "Beta", px: 101 }] })
    return store
  })
  const [innerStore] = useState(() => {
    const store = createRowStore<Row>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "Beta", px: 9 }] })
    return store
  })
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set(["Alpha"]))
  const [activated, setActivated] = useState(0)
  const [innerActivated, setInnerActivated] = useState(0)
  const columns = useMemo<ColumnDef<Row>[]>(() => [editorColumns[0]!, {
    key: "detail", header: "Related", width: 280, accessor: () => "",
    cell: ({ rowId }) => rowId === "Alpha" ? <>
      <div className="h-24 w-64"><DataGrid store={innerStore} columns={editorColumns} label="Nested pointer quotes" onRowActivate={() => setInnerActivated(count => count + 1)} /></div>
      {host && createPortal(<div className="h-24 w-64"><DataGrid store={innerStore} columns={editorColumns} label="Portaled pointer quotes" onRowActivate={() => setInnerActivated(count => count + 1)} /></div>, host)}
    </> : rowId,
  }], [innerStore, host])
  return <div data-grid-nested-pointer data-selection={[...selection].join(",")} data-activated={activated} data-inner-activated={innerActivated} className="flex flex-col gap-1">
    <div className="h-96"><DataGrid store={store} columns={columns} rowHeight={128} label="Outer pointer quotes" focusedRowId="Beta" selection={selection} onSelectionChange={setSelection} onRowActivate={() => setActivated(count => count + 1)} renderContextMenu={(_rows, ids) => <ContextMenuItem>Outer pointer action: {ids.join(",")}</ContextMenuItem>} /></div>
    <div ref={setHost} />
  </div>
}

function ShadowCell({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null)
  const [shadow, setShadow] = useState<ShadowRoot | null>(null)
  useLayoutEffect(() => {
    const root = host.current!.shadowRoot ?? host.current!.attachShadow({ mode: "open" })
    const styles = Array.from(host.current!.ownerDocument.querySelectorAll('link[rel="stylesheet"]'), link => link.cloneNode(true))
    root.append(...styles)
    setShadow(root)
    return () => styles.forEach(style => root.removeChild(style))
  }, [])
  return <div ref={host}>{shadow && createPortal(children, shadow)}</div>
}

const shadowViewOptions = {}

function GridShadowPointerScene() {
  const [store] = useState(() => {
    const store = createRowStore<Row>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "Alpha", px: 100 }, { id: "Beta", px: 101 }] })
    return store
  })
  const [innerStore] = useState(() => {
    const store = createRowStore<Row>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "Beta", px: 9 }] })
    return store
  })
  const view = useView(store, shadowViewOptions)!
  const [touches, setTouches] = useState(0)
  const observedView = useMemo<RowView<Row>>(() => ({
    store: view.store,
    getIds: () => view.getIds(),
    subscribe: listener => view.subscribe(listener),
    touch: () => { view.touch(); setTouches(count => count + 1) },
    isHeld: () => view.isHeld(),
    isDisposed: () => view.isDisposed(),
    dispose: () => view.dispose(),
  }), [view])
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set(["Beta"]))
  const [selected, setSelected] = useState(0)
  const [activated, setActivated] = useState(0)
  const [inspected, setInspected] = useState(0)
  const [innerActivated, setInnerActivated] = useState(0)
  const columns = useMemo<ColumnDef<Row>[]>(() => [editorColumns[0]!, {
    key: "shadow", header: "Shadow content", width: 320, accessor: () => "",
    cell: ({ rowId }) => rowId === "Alpha" ? <ShadowCell>
      <button type="button" onClick={() => setInspected(count => count + 1)}>Inspect shadow quote</button>
      <div data-shadow-plain className="h-12">Plain shadow quote</div>
      <div className="h-24"><DataGrid store={innerStore} columns={editorColumns} label="Shadow related quotes" onRowActivate={() => setInnerActivated(count => count + 1)} /></div>
    </ShadowCell> : rowId,
  }], [innerStore])
  return <div data-grid-shadow-pointer data-selection={[...selection].join(",")} data-selected={selected} data-activated={activated} data-inspected={inspected} data-inner-activated={innerActivated} data-touches={touches}>
    <div className="h-96"><DataGrid store={store} view={observedView} columns={columns} rowHeight={192} label="Shadow outer quotes" selection={selection} onSelectionChange={next => { setSelection(next); setSelected(count => count + 1) }} onRowActivate={() => setActivated(count => count + 1)} renderContextMenu={(_rows, ids) => <ContextMenuItem>Shadow outer action: {ids.join(",")}</ContextMenuItem>} /></div>
  </div>
}

function GridResizeScene() {
  const [store] = useState(() => {
    const store = createRowStore<Row>({ getRowId: row => row.id })
    store.applyDeltas({ upsert: [{ id: "Alpha", px: 100 }] })
    return store
  })
  const [state, setState] = useState<ColumnState>(EMPTY_COLUMN_STATE)
  const [calls, setCalls] = useState(0)
  const [mounted, setMounted] = useState(true)
  return <div data-grid-resize data-calls={calls} data-columns={JSON.stringify(state)} className="flex flex-col gap-1" onKeyDown={event => {
    if (event.key === "F8") setState(current => ({ ...current, widths: { ...current.widths, id: 150 } }))
    if (event.key === "F9") setState(current => ({ ...current, hidden: ["px"] }))
    if (event.key === "F10") setMounted(false)
  }}>
    <div className="h-40">{mounted && <DataGrid store={store} columns={editorColumns} columnState={state} onColumnStateChange={next => { setState(next); setCalls(count => count + 1) }} label="Resizable quotes" />}</div>
    <button type="button" onClick={() => { setMounted(true); setState(EMPTY_COLUMN_STATE); setCalls(0) }}>Reset resize example</button>
  </div>
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
