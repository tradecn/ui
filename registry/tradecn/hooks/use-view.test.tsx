import { act, render, screen } from "@testing-library/react"
import { Activity, StrictMode, Suspense, useLayoutEffect } from "react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useRowIds, useView } from "@/registry/tradecn/hooks/use-row-store"
import { createRowStore, type RowStore, type RowView, type ViewOptions } from "@/registry/tradecn/lib/row-store"
import { DataGrid, type ColumnDef } from "@/registry/tradecn/ui/data-grid"

interface Quote { id: string; px: number }
const ascending: ViewOptions<Quote> = { comparator: (a, b) => a.px - b.px }
const descending: ViewOptions<Quote> = { comparator: (a, b) => b.px - a.px }
const columns: ColumnDef<Quote>[] = [{ key: "id", header: "Symbol", width: 120, accessor: (row) => row.id }]

function makeStore() {
  const store = createRowStore<Quote>({ getRowId: (row) => row.id })
  store.applyDeltas({ upsert: [{ id: "a", px: 2 }, { id: "b", px: 1 }] })
  return store
}

function Reading({ view }: { view: RowView<Quote> }) {
  const ids = useRowIds(view)
  return <output>{ids.join(",")}</output>
}

function Owned({ store, options = ascending }: { store: RowStore<Quote>; options?: ViewOptions<Quote> }) {
  const view = useView(store, options)!
  return <Reading view={view} />
}

afterEach(() => vi.useRealTimers())

describe("useView ownership", () => {
  it("leaves no view doing feed work after StrictMode unmount", () => {
    const store = makeStore()
    const filter = vi.fn(() => true)
    const { unmount } = render(<StrictMode><Owned store={store} options={{ ...ascending, filter }} /></StrictMode>)
    expect(screen.getByRole("status")).toHaveTextContent("b,a")
    unmount()
    filter.mockClear()
    store.applyDeltas({ upsert: [{ id: "c", px: 0 }] })
    expect(filter).not.toHaveBeenCalled()
  })

  it("does no later feed work for an abandoned initial suspended render", () => {
    const store = makeStore()
    const filter = vi.fn(() => true)
    const options = { ...ascending, filter }
    const pending = new Promise<never>(() => {})
    function Pending(): never {
      useView(store, options)
      throw pending
    }
    const { unmount } = render(<Suspense fallback="Waiting"><Pending /></Suspense>)
    expect(screen.getByText("Waiting")).toBeInTheDocument()
    unmount()
    filter.mockClear()
    store.applyDeltas({ upsert: [{ id: "c", px: 0 }] })
    expect(filter).not.toHaveBeenCalled()
  })

  it("renders sorted server output without leaving a live view", () => {
    const store = makeStore()
    const filter = vi.fn(() => true)
    expect(renderToString(<Owned store={store} options={{ ...ascending, filter }} />)).toContain("b,a")
    filter.mockClear()
    store.applyDeltas({ upsert: [{ id: "c", px: 0 }] })
    expect(filter).not.toHaveBeenCalled()
  })

  it("switches a grid from a borrowed view to an owned view synchronously", () => {
    const store = makeStore()
    const supplied = store.createView(descending)
    const { rerender, unmount } = render(<DataGrid store={store} view={supplied} columns={columns} label="Quotes" />)
    expect(() => rerender(<DataGrid store={store} columns={columns} label="Quotes" />)).not.toThrow()
    unmount()
    expect(supplied.isDisposed()).toBe(false)
    store.applyDeltas({ upsert: [{ id: "c", px: 3 }] })
    expect(supplied.getIds()).toEqual(["c", "a", "b"])
    supplied.dispose()
  })

  it("gives child layouts the current store, options and null during every commit", () => {
    const first = makeStore()
    const second = makeStore()
    second.applyDeltas({ upsert: [{ id: "c", px: 0 }] })
    const seen = vi.fn()
    function Child({ view }: { view: RowView<Quote> | null }) {
      useLayoutEffect(() => { seen(view?.store ?? null, view?.getIds() ?? null) })
      return null
    }
    function Owner({ store, options }: { store: RowStore<Quote>; options: ViewOptions<Quote> | null }) {
      return <Child view={useView(store, options)} />
    }
    const { rerender } = render(<Owner store={first} options={null} />)
    seen.mockClear()
    rerender(<Owner store={first} options={ascending} />)
    expect(seen.mock.calls).toEqual([[first, ["b", "a"]]])
    seen.mockClear()
    rerender(<Owner store={second} options={descending} />)
    expect(seen.mock.calls).toEqual([[second, ["a", "b", "c"]]])
    seen.mockClear()
    rerender(<Owner store={second} options={null} />)
    expect(seen.mock.calls).toEqual([[null, null]])
  })

  it("stops work and timers while Activity is hidden, then resumes the same view", () => {
    vi.useFakeTimers()
    const store = makeStore()
    const filter = vi.fn(() => true)
    const options = { ...ascending, filter, reorderHoldMs: 1000 }
    const seen = vi.fn()
    function Child({ view }: { view: RowView<Quote> }) {
      useLayoutEffect(() => { seen(view); view.touch() }, [view])
      return <Reading view={view} />
    }
    function Owner() { return <Child view={useView(store, options)!} /> }
    const { rerender, unmount } = render(<Activity mode="visible"><Owner /></Activity>)
    const original = seen.mock.calls[0]![0]
    expect(vi.getTimerCount()).toBe(1)
    rerender(<Activity mode="hidden"><Owner /></Activity>)
    expect(vi.getTimerCount()).toBe(0)
    filter.mockClear()
    act(() => store.applyDeltas({ upsert: [{ id: "c", px: 0 }] }))
    expect(filter).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1000))
    rerender(<Activity mode="visible"><Owner /></Activity>)
    expect(seen.mock.calls.at(-1)![0]).toBe(original)
    expect(screen.getByRole("status")).toHaveTextContent("c,b,a")
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("lets child layouts read and touch during StrictMode replay without a dead handle", () => {
    vi.useFakeTimers()
    const store = makeStore()
    const options = { ...ascending, reorderHoldMs: 1000 }
    const seen = vi.fn()
    function Child({ view }: { view: RowView<Quote> }) {
      useLayoutEffect(() => { seen(view.isDisposed()); view.touch() }, [view])
      return <Reading view={view} />
    }
    function Owner() { return <Child view={useView(store, options)!} /> }
    const { unmount } = render(<StrictMode><Owner /></StrictMode>)
    expect(seen.mock.calls.every(([disposed]) => !disposed)).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    act(() => store.applyDeltas({ patch: [{ id: "a", fields: { px: 0 } }] }))
    expect(screen.getByRole("status")).toHaveTextContent("b,a")
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByRole("status")).toHaveTextContent("a,b")
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
