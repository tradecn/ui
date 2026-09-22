import { act, fireEvent, render, screen } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { formatPrice, parsePrice } from "@/registry/tradecn/lib/format"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { DATA_GRID_PRESETS, DataGrid, compareForSort, editProblem, exportCsv, resolveColumns, type ColumnDef, type EditChange, type EditStatus } from "@/registry/tradecn/ui/data-grid"

interface Quote {
  id: string
  sym: string
  px: number
  qty: number | null
}

const columns: ColumnDef<Quote>[] = [
  { key: "sym", header: "Symbol", width: 80, frozen: "left", sortable: true, accessor: (r) => r.sym },
  { key: "px", header: "Price", width: 90, numeric: true, sortable: true, accessor: (r) => r.px, format: (v) => (v as number).toFixed(2) },
  { key: "qty", header: "Qty", width: 70, numeric: true, accessor: (r) => r.qty },
]

const ORIGINAL_RECT = HTMLElement.prototype.getBoundingClientRect
const ROW_HEIGHT = 20
const RECT = { width: 600, height: 200 } // 10 visible rows

function seed(n: number, store: RowStore<Quote>) {
  store.applyDeltas({ upsert: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, sym: `S${String(i).padStart(4, "0")}`, px: 100 + i, qty: i % 7 === 0 ? null : i * 10 })) })
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({ cancel: vi.fn(), currentTime: 0, onfinish: null })),
  })
  // No layout in happy-dom: give the scroll container the viewport the test assumes.
  // The virtualizer reads offsetWidth/offsetHeight; the context menu reads getBoundingClientRect.
  for (const [prop, size] of [["offsetWidth", RECT.width], ["offsetHeight", RECT.height]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("overflow-auto") ? size : 0
      },
    })
  }
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("overflow-auto")) return { x: 0, y: 0, top: 0, left: 0, right: RECT.width, bottom: RECT.height, width: RECT.width, height: RECT.height, toJSON() {} } as DOMRect
    return ORIGINAL_RECT.call(this)
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("DataGrid", () => {
  it("mounts a thousand rows as only the visible ones plus overscan, with grid semantics", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(1000, store)
    render(<DataGrid store={store} columns={columns} label="Quotes" rowHeight={ROW_HEIGHT} overscan={5} initialRect={RECT} />)
    const grid = screen.getByRole("grid", { name: "Quotes" })
    expect(grid.dataset.slot).toBe("tradecn-data-grid")
    expect(grid).toHaveAttribute("aria-rowcount", "1001")
    expect(grid).toHaveAttribute("aria-colcount", "3")
    const rows = screen.getAllByRole("row")
    expect(rows.length).toBeGreaterThan(5)
    expect(rows.length).toBeLessThanOrEqual(1 + 10 + 5 * 2)
    expect(rows[1]).toHaveAttribute("aria-rowindex", "2")
    expect(screen.getAllByRole("columnheader")).toHaveLength(3)
    expect(screen.getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", "none")
    const first = rows[1]!
    expect(first.dataset.rowId).toBe("r0")
    expect(first.querySelectorAll("[role=gridcell]")[1]).toHaveTextContent("100.00")
    expect(first.querySelectorAll("[role=gridcell]")[2]).toHaveTextContent("–")
  })

  it("a patch to one visible row re-renders that row only", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(50, store)
    const renders = new Map<string, number>()
    const counted: ColumnDef<Quote>[] = [
      ...columns,
      {
        key: "probe",
        header: "Probe",
        width: 40,
        accessor: (r) => r.id,
        cell: ({ rowId }) => {
          renders.set(rowId, (renders.get(rowId) ?? 0) + 1)
          return rowId
        },
      },
    ]
    render(<DataGrid store={store} columns={counted} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} />)
    const before = new Map(renders)
    act(() => store.applyDeltas({ patch: [{ id: "r3", fields: { px: 999 } }] }))
    expect(renders.get("r3")).toBe(before.get("r3")! + 1)
    for (const [id, n] of before) if (id !== "r3") expect(renders.get(id)).toBe(n)
    expect(screen.getByText("999.00")).toBeInTheDocument()
  })

  it("focus and selection are ids, so they survive a reorder; the hold keeps rows still while the user works", () => {
    vi.useFakeTimers()
    try {
      const store = createRowStore<Quote>({ getRowId: (r) => r.id })
      seed(20, store)
      const onFocus = vi.fn()
      render(
        <DataGrid store={store} columns={columns} label="Quotes" preset="rfq" rowHeight={ROW_HEIGHT} initialRect={RECT} sort={{ key: "px", dir: "desc" }} onFocusedRowChange={onFocus} />,
      )
      const grid = screen.getByRole("grid")
      // Sorted by price desc: r19 first.
      expect(screen.getAllByRole("row")[1]!.dataset.rowId).toBe("r19")
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      fireEvent.keyDown(grid, { key: "ArrowDown" })
      expect(onFocus).toHaveBeenLastCalledWith("r18")
      const focusedId = grid.getAttribute("aria-activedescendant")!
      expect(document.getElementById(focusedId)!.dataset.rowId).toBe("r18")
      // Under the rfq hold (1000 ms) a price jump does not move rows.
      act(() => store.applyDeltas({ patch: [{ id: "r0", fields: { px: 5000 } }] }))
      expect(screen.getAllByRole("row")[1]!.dataset.rowId).toBe("r19")
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(screen.getAllByRole("row")[1]!.dataset.rowId).toBe("r0")
      // Still focused on r18 by id.
      expect(document.getElementById(grid.getAttribute("aria-activedescendant")!)!.dataset.rowId).toBe("r18")
    } finally {
      vi.useRealTimers()
    }
  })

  it("keyboard selection in multi mode: range, toggle, select all, clear", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    const onSelection = vi.fn()
    render(<DataGrid store={store} columns={columns} label="Quotes" preset="blotter" rowHeight={ROW_HEIGHT} initialRect={RECT} onSelectionChange={onSelection} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: " " })
    expect([...onSelection.mock.lastCall![0]]).toEqual(["r0"])
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true })
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true })
    expect([...onSelection.mock.lastCall![0]].sort()).toEqual(["r0", "r1", "r2"])
    fireEvent.keyDown(grid, { key: "a", ctrlKey: true })
    expect(onSelection.mock.lastCall![0].size).toBe(10)
    fireEvent.keyDown(grid, { key: "Escape" })
    expect(onSelection.mock.lastCall![0].size).toBe(0)
  })

  it("Enter and double-click activate the row; a right-click targets the row under the pointer", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(5, store)
    const onActivate = vi.fn()
    const menu = vi.fn((_rows: Quote[], ids: string[]) => <div data-testid="menu">{ids.join(",")}</div>)
    render(<DataGrid store={store} columns={columns} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} onRowActivate={onActivate} renderContextMenu={menu} />)
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "r0" }), "r0")
    const r3 = document.querySelector<HTMLElement>('[data-row-id="r3"]')!
    fireEvent.contextMenu(r3.firstElementChild!)
    expect(menu).toHaveBeenLastCalledWith([expect.objectContaining({ id: "r3" })], ["r3"])
  })

  it("sorting cycles asc, desc, off from the header, and hides and reorders from column state", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(5, store)
    const onSort = vi.fn()
    const onColumns = vi.fn()
    render(<DataGrid store={store} columns={columns} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} onSortChange={onSort} onColumnStateChange={onColumns} />)
    const price = screen.getByRole("columnheader", { name: /Price/ })
    fireEvent.click(price.querySelector("span")!)
    expect(onSort).toHaveBeenLastCalledWith({ key: "px", dir: "asc" })
    expect(price).toHaveAttribute("aria-sort", "ascending")
    fireEvent.click(price.querySelector("span")!)
    expect(onSort).toHaveBeenLastCalledWith({ key: "px", dir: "desc" })
    fireEvent.click(price.querySelector("span")!)
    expect(onSort).toHaveBeenLastCalledWith(null)
    // Column focus and keyboard column ops.
    const grid = screen.getByRole("grid")
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowRight", altKey: true })
    expect(onColumns).toHaveBeenLastCalledWith(expect.objectContaining({ order: ["sym", "qty", "px"] }))
    fireEvent.keyDown(grid, { key: "ArrowRight", altKey: true, shiftKey: true })
    expect(onColumns.mock.lastCall![0].widths.px).toBe(98)
    fireEvent.keyDown(grid, { key: "h", altKey: true })
    expect(onColumns.mock.lastCall![0].hidden).toEqual(["px"])
    expect(screen.queryByRole("columnheader", { name: /Price/ })).toBeNull()
  })

  it("keeps the first visible row pinned when rows arrive above it (ordered lane)", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id, lane: "ordered" })
    seed(40, store)
    render(<DataGrid store={store} columns={columns} label="RFQs" preset="rfq" rowHeight={ROW_HEIGHT} initialRect={RECT} />)
    const scroller = screen.getByRole("grid").querySelector<HTMLElement>(".overflow-auto")!
    scroller.scrollTop = 10 * ROW_HEIGHT
    fireEvent.scroll(scroller)
    act(() => store.applyDeltas({ upsert: [{ id: "n1", sym: "NEW1", px: 1, qty: 1 }, { id: "n2", sym: "NEW2", px: 1, qty: 1 }], order: ["n1", "n2", ...Array.from({ length: 40 }, (_, i) => `r${i}`)] }))
    expect(scroller.scrollTop).toBe(12 * ROW_HEIGHT)
  })

  it("renders the empty state", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    render(<DataGrid store={store} columns={columns} label="Quotes" initialRect={RECT} emptyState="Nothing yet" />)
    expect(screen.getByText("Nothing yet")).toBeInTheDocument()
  })
})

describe("rules as data", () => {
  const thirtySeconds = { kind: "fraction", denominator: 32, half: "+" } as const
  const ruled: ColumnDef<Quote>[] = [
    { key: "sym", header: "Symbol", width: 80, frozen: "left", sortable: true, accessor: (r) => r.sym },
    { key: "px", header: "Price", width: 90, numeric: true, sortable: true, accessor: (r) => r.px, format: (v) => formatPrice(v as number, thirtySeconds), parse: (text) => parsePrice(text, thirtySeconds) },
    { key: "qty", header: "Qty", width: 70, numeric: true, sortable: true, accessor: (r) => r.qty },
  ]
  const rules: GridRules = {
    columns: [
      { id: "rich", column: "px", when: { op: "gte", value: "105-00" }, tone: "up", label: "Rich to the market" },
      { id: "cheap", column: "px", when: { op: "lt", value: "101-16" }, tone: "down" },
      { id: "big", column: "qty", when: { op: "gte", value: "70" }, tone: "primary", target: "row", label: "Large" },
    ],
    filter: [{ column: "qty", op: "notNull" }],
    sort: [{ key: "qty", dir: "desc" }],
  }
  const cell = (rowId: string, key: string) => document.querySelector<HTMLElement>(`[data-row-id="${rowId}"] [data-col="${key}"]`)!

  it("colors a cell by the first matching rule, in the column's own notation, and says the rule in words beside the color", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    render(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} rules={rules} />)
    // Prices run 100 + i: r9 at 109 is above 105-00, r1 at 101 is below 101-16, r3 at 103 is neither. r0 is filtered out (its qty is null).
    expect(cell("r9", "px")).toHaveAttribute("data-rule", "rich")
    expect(cell("r9", "px")).toHaveAttribute("data-tone", "up")
    expect(cell("r9", "px")).toHaveAttribute("aria-description", "Rich to the market")
    expect(cell("r9", "px").className).toContain("text-up")
    expect(cell("r1", "px")).toHaveAttribute("data-rule", "cheap")
    expect(cell("r1", "px")).toHaveAttribute("aria-description", "Price below 101-16")
    expect(cell("r3", "px")).not.toHaveAttribute("data-rule")
    expect(cell("r3", "px")).not.toHaveAttribute("aria-description")
    // The row rule marks the row, not the cell it read.
    const big = document.querySelector<HTMLElement>('[data-row-id="r9"]')!
    expect(big).toHaveAttribute("data-rule", "big")
    expect(big).toHaveAttribute("data-tone", "primary")
    expect(big).toHaveAttribute("aria-description", "Large")
    expect(big.className).toContain("text-primary")
    expect(cell("r9", "qty")).not.toHaveAttribute("data-rule")
    expect(document.querySelector('[data-row-id="r2"]')).not.toHaveAttribute("data-rule")
    // The frozen cell keeps its opaque background and paints the row's tint over it, so the row's color has no gap; the other cells leave it to the row.
    expect(cell("r9", "sym").className).toContain("bg-background")
    expect(cell("r9", "sym").className).toContain("linear-gradient(color-mix(in_oklab,var(--primary)")
    expect(cell("r9", "qty").className).not.toContain("linear-gradient")
    expect(cell("r2", "sym").className).not.toContain("linear-gradient")
  })

  it("filters and orders by the rules, and a header sort comes first with the rules breaking its ties", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    const { rerender } = render(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} rules={rules} />)
    const grid = screen.getByRole("grid")
    // r0 and r7 have a null qty and are filtered out; the rest run by qty, largest first.
    expect(grid).toHaveAttribute("aria-rowcount", "9")
    expect(screen.getAllByRole("row").slice(1).map((row) => row.getAttribute("data-row-id"))).toEqual(["r9", "r8", "r6", "r5", "r4", "r3", "r2", "r1"])
    // A header sort by price ascending comes first; the rule's order would have reversed it.
    rerender(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} rules={rules} sort={{ key: "px", dir: "asc" }} />)
    expect(screen.getAllByRole("row").slice(1).map((row) => row.getAttribute("data-row-id"))).toEqual(["r1", "r2", "r3", "r4", "r5", "r6", "r8", "r9"])
    // Your own filter applies with the rules'.
    rerender(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} rules={rules} filter={(r) => r.px < 105} />)
    expect(grid).toHaveAttribute("aria-rowcount", "5")
  })

  it("ignores the rules' filter and sort on a view of yours, and still colors by them", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    const view = store.createView({ comparator: (a, b) => a.px - b.px })
    render(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} rules={rules} view={view} />)
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "11")
    expect(screen.getAllByRole("row")[1]).toHaveAttribute("data-row-id", "r0")
    expect(cell("r9", "px")).toHaveAttribute("data-rule", "rich")
    view.dispose()
  })

  it("puts a null last from the header whichever way the sort runs", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    render(<DataGrid store={store} columns={ruled} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} sort={{ key: "qty", dir: "desc" }} />)
    const ids = screen.getAllByRole("row").slice(1).map((row) => row.getAttribute("data-row-id"))
    expect(ids.slice(0, 2)).toEqual(["r9", "r8"])
    expect(ids.slice(-2).sort()).toEqual(["r0", "r7"])
  })
})

describe("helpers", () => {
  it("compareForSort puts nulls last and sorts numbers numerically", () => {
    expect([3, null, 1, 20, undefined].sort(compareForSort)).toEqual([1, 3, 20, null, undefined])
    expect(["b", "a"].sort(compareForSort)).toEqual(["a", "b"])
  })
  it("resolveColumns orders, hides, sizes with minimums, and leads with frozen columns", () => {
    const r = resolveColumns(columns, { order: ["qty", "px", "sym"], widths: { px: 10 }, hidden: [] })
    expect(r.map((c) => c.key)).toEqual(["sym", "qty", "px"])
    expect(r.find((c) => c.key === "px")!.width).toBe(48)
    expect(resolveColumns(columns, { order: [], widths: {}, hidden: ["qty"] }).map((c) => c.key)).toEqual(["sym", "px"])
  })
  it("exportCsv quotes what needs quoting and formats through the column", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    store.applyDeltas({ upsert: [{ id: "a", sym: 'A,"Q"', px: 1.5, qty: null }] })
    expect(exportCsv(store, columns, ["a", "missing"])).toBe('Symbol,Price,Qty\r\n"A,""Q""",1.50,\r\n')
  })
  it("presets are complete", () => {
    for (const p of Object.values(DATA_GRID_PRESETS)) expect(p.rowHeight).toBeGreaterThan(0)
  })
})

describe("under StrictMode", () => {
  it("keeps following the store after the mount rehearsal: rows that arrive later appear, in order", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(3, store)
    render(
      <StrictMode>
        <DataGrid store={store} columns={columns} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} sort={{ key: "px", dir: "asc" }} />
      </StrictMode>,
    )
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "4")
    act(() => store.applyDeltas({ upsert: [{ id: "r9", sym: "S9", px: 50, qty: 1 }] }))
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "5")
    expect(screen.getAllByRole("row")[1]).toHaveAttribute("data-row-id", "r9")
  })
})

describe("footer totals and the tape", () => {
  it("totals the view's rows in a sticky row, in the column's figures, once per applied batch", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(10, store)
    const total = vi.fn((rows: Quote[]) => rows.reduce((s, r) => s + r.px, 0).toFixed(2))
    const footer = { px: total }
    render(<DataGrid store={store} columns={columns} label="Quotes" rowHeight={ROW_HEIGHT} initialRect={RECT} footer={footer} filter={(r) => r.px < 105} />)
    const grid = screen.getByRole("grid")
    // Five rows pass the filter, plus the header and the footer.
    expect(grid).toHaveAttribute("aria-rowcount", "7")
    const row = grid.querySelector("[data-grid-footer]")!
    expect(row).toHaveAttribute("role", "row")
    expect(row).toHaveAttribute("aria-rowindex", "7")
    const cell = row.querySelector("[data-col='px']")!
    expect(cell).toHaveTextContent("510.00")
    expect(cell).toHaveAttribute("data-numeric")
    expect(cell.className).toContain("justify-end")
    expect(row.querySelector("[data-col='sym']")).toHaveTextContent("")
    expect(total).toHaveBeenCalledTimes(1)
    // One batch touching three rows is one recompute, over the rows the view shows: r0 leaves the filter.
    act(() =>
      store.applyDeltas({
        patch: [
          { id: "r0", fields: { px: 200 } },
          { id: "r1", fields: { px: 101.5 } },
          { id: "r2", fields: { px: 102.5 } },
        ],
      }),
    )
    expect(total).toHaveBeenCalledTimes(2)
    expect(cell).toHaveTextContent("411.00")
    expect(grid).toHaveAttribute("aria-rowcount", "6")
  })

  it("a tape follows the tail and counts arrivals on a pill after a touch, and the pill returns to the tail", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(5, store)
    render(<DataGrid store={store} columns={columns} label="Tape" preset="tape" rowHeight={ROW_HEIGHT} initialRect={RECT} />)
    const grid = screen.getByRole("grid")
    expect(grid).toHaveAttribute("data-preset", "tape")
    expect(DATA_GRID_PRESETS.tape.rowEnter).toEqual({ highlight: true, pinViewport: false, followTail: true })
    // Rows arriving while following: no pill.
    act(() => store.applyDeltas({ upsert: [{ id: "r5", sym: "S0005", px: 105, qty: 50 }] }))
    expect(grid.querySelector("[data-grid-behind]")).toBeNull()
    // A pointer on a row stops the following; the arrivals from then on count.
    fireEvent.pointerDown(screen.getAllByRole("row")[1]!)
    act(() =>
      store.applyDeltas({
        upsert: [
          { id: "r6", sym: "S0006", px: 106, qty: 60 },
          { id: "r7", sym: "S0007", px: 107, qty: 70 },
        ],
      }),
    )
    const pill = grid.querySelector("[data-grid-behind]")!
    expect(pill).toHaveTextContent("2 new")
    expect(pill).toHaveAttribute("data-grid-behind", "2")
    fireEvent.click(pill)
    expect(grid.querySelector("[data-grid-behind]")).toBeNull()
    // A key stops it too.
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    act(() => store.applyDeltas({ upsert: [{ id: "r8", sym: "S0008", px: 108, qty: 80 }] }))
    expect(grid.querySelector("[data-grid-behind]")).toHaveTextContent("1 new")
    // Another preset never shows it.
    const other = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(2, other)
    const { container } = render(<DataGrid store={other} columns={columns} label="Blotter" rowHeight={ROW_HEIGHT} initialRect={RECT} />)
    fireEvent.pointerDown(container.querySelector("[data-row-id='r0']")!)
    act(() => other.applyDeltas({ upsert: [{ id: "r9", sym: "S0009", px: 109, qty: 90 }] }))
    expect(container.querySelector("[data-grid-behind]")).toBeNull()
  })
})

describe("editing", () => {
  const price = (text: string) => {
    const n = Number(text.trim())
    return Number.isFinite(n) ? n : editProblem("Not a price.")
  }
  const editable: ColumnDef<Quote>[] = [
    { key: "sym", header: "Symbol", width: 80, frozen: "left", accessor: (r) => r.sym },
    { key: "px", header: "Price", width: 90, numeric: true, accessor: (r) => r.px, format: (v) => (v as number).toFixed(2), edit: { parse: price, validate: (v) => ((v as number) > 1000 ? editProblem("Above 1,000.") : null), step: (v, dir, big) => (v as number) + dir * (big ? 10 : 1) } },
    { key: "qty", header: "Qty", width: 70, numeric: true, accessor: (r) => r.qty, edit: { parse: (t) => (t.trim() === "" ? null : Number(t)), canEdit: (r) => r.id !== "r2" } },
  ]
  const setup = (onEdit?: (change: EditChange<Quote>) => void | Promise<unknown>, columns = editable) => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    seed(5, store)
    const onActivate = vi.fn()
    render(<DataGrid store={store} columns={columns} label="Sheet" preset="parameters" rowHeight={ROW_HEIGHT} initialRect={RECT} onEdit={onEdit} onRowActivate={onActivate} />)
    const grid = screen.getByRole("grid")
    const cell = (rowId: string, key: string) => document.querySelector<HTMLElement>(`[data-row-id="${rowId}"] [data-col="${key}"]`)!
    // Focus r1's price cell: down twice, right twice.
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    return { store, grid, cell, onActivate }
  }
  const editor = () => screen.getByRole("textbox", { name: "Price" }) as HTMLInputElement

  it("opens on Enter with the text selected, commits on Enter as a change, shows the committed value as pending, and settles when the store agrees", () => {
    const onEdit = vi.fn()
    const { store, grid, cell } = setup(onEdit)
    expect(grid).toHaveAttribute("data-editable")
    expect(grid).toHaveAttribute("data-preset", "parameters")
    expect(cell("r1", "px")).toHaveAttribute("data-editable")
    expect(cell("r1", "px")).toHaveAttribute("aria-readonly", "false")
    expect(cell("r1", "sym")).not.toHaveAttribute("data-editable")
    fireEvent.keyDown(grid, { key: "Enter" })
    const input = editor()
    expect(cell("r1", "px")).toHaveAttribute("data-editing")
    expect(input.value).toBe("101.00")
    expect(input).toHaveAttribute("data-numeric")
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(6)
    fireEvent.change(input, { target: { value: "105.5" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith({ rowId: "r1", key: "px", value: 105.5, previous: 101, row: expect.objectContaining({ id: "r1" }) })
    // The editor is gone, the grid has the keyboard, the cell wears the committed value muted until the server agrees.
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(document.activeElement).toBe(grid)
    expect(cell("r1", "px")).toHaveAttribute("data-pending")
    expect(cell("r1", "px")).toHaveTextContent("105.50")
    act(() => store.applyDeltas({ patch: [{ id: "r1", fields: { px: 105.5 } }] }))
    expect(cell("r1", "px")).not.toHaveAttribute("data-pending")
    expect(cell("r1", "px")).toHaveTextContent("105.50")
    // A patch to another value does not settle it.
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "106" } })
    fireEvent.keyDown(editor(), { key: "Enter" })
    act(() => store.applyDeltas({ patch: [{ id: "r1", fields: { px: 107 } }] }))
    expect(cell("r1", "px")).toHaveAttribute("data-pending")
    expect(cell("r1", "px")).toHaveTextContent("106.00")
  })

  it("settles when the promise resolves, and a rejection keeps the previous value and prints the message in the cell", async () => {
    let settle: (v?: unknown) => void = () => {}
    let refuse: (e: unknown) => void = () => {}
    const onEdit = vi.fn(() => new Promise((resolve, reject) => ((settle = resolve), (refuse = reject))))
    const { grid, cell } = setup(onEdit)
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "105.5" } })
    fireEvent.keyDown(editor(), { key: "Enter" })
    expect(cell("r1", "px")).toHaveAttribute("data-pending")
    await act(async () => {
      settle()
      await Promise.resolve()
    })
    expect(cell("r1", "px")).not.toHaveAttribute("data-pending")
    expect(cell("r1", "px")).toHaveTextContent("101.00")
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "99" } })
    fireEvent.keyDown(editor(), { key: "Enter" })
    await act(async () => {
      refuse(new Error("Outside the desk's band"))
      await Promise.resolve()
    })
    const px = cell("r1", "px")
    expect(px).not.toHaveAttribute("data-pending")
    expect(px).toHaveAttribute("data-rejected", "Outside the desk's band")
    expect(px).toHaveAttribute("aria-description", "Outside the desk's band")
    expect(px.className).toContain("text-destructive")
    expect(px).toHaveTextContent("101.00Outside the desk's band")
    // The next edit of the cell clears the rejection.
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(px).not.toHaveAttribute("data-rejected")
    fireEvent.keyDown(editor(), { key: "Escape" })
  })

  it("keeps the editor open with the problem said when the text does not parse or fails the check, and Escape reverts", () => {
    const onEdit = vi.fn()
    const { grid, cell } = setup(onEdit)
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "abc" } })
    fireEvent.keyDown(editor(), { key: "Enter" })
    expect(editor()).toHaveAttribute("aria-invalid", "true")
    expect(editor()).toHaveAttribute("aria-description", "Not a price.")
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.change(editor(), { target: { value: "2000" } })
    expect(editor()).not.toHaveAttribute("aria-invalid")
    fireEvent.keyDown(editor(), { key: "Enter" })
    expect(editor()).toHaveAttribute("aria-description", "Above 1,000.")
    fireEvent.keyDown(editor(), { key: "Escape" })
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(cell("r1", "px")).toHaveTextContent("101.00")
    expect(cell("r1", "px")).not.toHaveAttribute("data-pending")
    expect(onEdit).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(grid)
    // A blur with text that does not parse drops the edit; one that parses commits it.
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "x" } })
    fireEvent.blur(editor())
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "102" } })
    fireEvent.blur(editor())
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ value: 102 }))
  })

  it("Tab commits and opens the next editable cell of the row, Shift+Tab the one before, and the row's end hands the keyboard back to the grid", () => {
    const onEdit = vi.fn()
    const { grid, cell } = setup(onEdit)
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.change(editor(), { target: { value: "103" } })
    fireEvent.keyDown(editor(), { key: "Tab" })
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ key: "px", value: 103 }))
    const qty = screen.getByRole("textbox", { name: "Qty" }) as HTMLInputElement
    expect(qty.value).toBe("10")
    expect(cell("r1", "qty")).toHaveAttribute("data-editing")
    fireEvent.keyDown(qty, { key: "Tab", shiftKey: true })
    // Nothing changed in qty, so nothing was sent; the price editor is open again.
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(editor().value).toBe("103.00")
    fireEvent.keyDown(editor(), { key: "Tab", shiftKey: true })
    // No editable column before the price: the keyboard is the grid's.
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(document.activeElement).toBe(grid)
  })

  it("steps with the bare arrows when the column steps, ten with Shift, and leaves a modifier-held arrow to the listeners above", () => {
    const { grid } = setup(vi.fn())
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.keyDown(editor(), { key: "ArrowUp" })
    expect(editor().value).toBe("102.00")
    fireEvent.keyDown(editor(), { key: "ArrowDown", shiftKey: true })
    expect(editor().value).toBe("92.00")
    const held = fireEvent.keyDown(editor(), { key: "ArrowUp", metaKey: true })
    expect(held, "not prevented: the registry above may take it").toBe(true)
    expect(editor().value).toBe("92.00")
    // The grid's own arrows do not move focus while the editor is open.
    expect(grid.getAttribute("aria-activedescendant")).toContain("r1")
  })

  it("opens by typing, with the character typed, by F2, and by a double click on the cell; a cell that cannot be edited leaves Enter to the row", () => {
    const onEdit = vi.fn()
    const { grid, cell, onActivate } = setup(onEdit)
    fireEvent.keyDown(grid, { key: "9" })
    expect(editor().value).toBe("9")
    expect(editor().selectionStart).toBe(1)
    fireEvent.keyDown(editor(), { key: "Escape" })
    fireEvent.keyDown(grid, { key: "F2" })
    expect(editor().value).toBe("101.00")
    fireEvent.keyDown(editor(), { key: "Escape" })
    fireEvent.doubleClick(cell("r3", "px").firstElementChild!)
    expect(editor().value).toBe("103.00")
    expect(grid.getAttribute("aria-activedescendant")).toContain("r3")
    fireEvent.keyDown(editor(), { key: "Escape" })
    expect(onActivate).not.toHaveBeenCalled()
    // r2's quantity is read-only by canEdit: Enter activates the row, a double click too, and the cell says so.
    fireEvent.keyDown(grid, { key: "ArrowUp" })
    fireEvent.keyDown(grid, { key: "ArrowRight" })
    expect(cell("r2", "qty")).toHaveAttribute("aria-readonly", "true")
    expect(cell("r2", "qty")).not.toHaveAttribute("data-editable")
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: "r2" }), "r2")
    fireEvent.doubleClick(cell("r2", "qty").firstElementChild!)
    expect(onActivate).toHaveBeenCalledTimes(2)
    // A column with no edit: Enter activates as it always did.
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    fireEvent.keyDown(grid, { key: "ArrowLeft" })
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(onActivate).toHaveBeenCalledTimes(3)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it("a toggle column commits the toggled value from Enter or Space and never opens an editor, and a cell renderer commits through its handle", () => {
    const onEdit = vi.fn()
    const seen: (EditStatus | undefined)[] = []
    const columns: ColumnDef<Quote>[] = [
      { key: "sym", header: "Symbol", width: 80, accessor: (r) => r.sym },
      {
        key: "on",
        header: "On",
        width: 40,
        accessor: (r) => r.qty !== null,
        edit: { parse: (t) => t === "on", toggle: (v) => !v },
        cell: ({ value, edit }) => {
          seen.push(edit?.status)
          return (
            <button type="button" data-on={String(value)} onClick={() => edit?.commit(!value)}>
              {value ? "on" : "off"}
            </button>
          )
        },
      },
      { key: "px", header: "Price", width: 90, numeric: true, accessor: (r) => r.px, edit: { parse: price } },
    ]
    const { grid, cell } = setup(onEdit, columns)
    // Focus sits on r1's second column, the toggle.
    fireEvent.keyDown(grid, { key: "Enter" })
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ rowId: "r1", key: "on", value: false, previous: true }))
    expect(cell("r1", "on")).toHaveAttribute("data-pending")
    expect(seen.at(-1)).toMatchObject({ kind: "pending", value: false })
    fireEvent.keyDown(grid, { key: "ArrowDown" })
    fireEvent.keyDown(grid, { key: " " })
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ rowId: "r2", key: "on", value: false }))
    fireEvent.keyDown(grid, { key: "9" })
    expect(screen.queryByRole("textbox")).toBeNull()
    fireEvent.click(cell("r3", "on").querySelector("button")!)
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ rowId: "r3", key: "on", value: false }))
    expect(onEdit).toHaveBeenCalledTimes(3)
  })

  it("opens nothing without onEdit", () => {
    const { grid, cell } = setup(undefined)
    expect(grid).not.toHaveAttribute("data-editable")
    expect(cell("r1", "px")).not.toHaveAttribute("data-editable")
    fireEvent.keyDown(grid, { key: "Enter" })
    fireEvent.keyDown(grid, { key: "9" })
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})
