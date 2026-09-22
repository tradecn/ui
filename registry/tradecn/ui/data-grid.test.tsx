import { act, fireEvent, render, screen } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { formatPrice, parsePrice } from "@/registry/tradecn/lib/format"
import type { GridRules } from "@/registry/tradecn/lib/grid-rules"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"
import { DATA_GRID_PRESETS, DataGrid, compareForSort, exportCsv, resolveColumns, type ColumnDef } from "@/registry/tradecn/ui/data-grid"

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
