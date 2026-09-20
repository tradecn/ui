import { act, render, screen } from "@testing-library/react"
import { memo, type FC } from "react"
import { describe, expect, it } from "vitest"
import { useRow, useRowIds, useStoreMeta } from "@/registry/tradecn/hooks/use-row-store"
import { createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"

interface Quote {
  id: string
  px: number
}

const renders: Record<string, number> = {}
const Row: FC<{ store: RowStore<Quote>; id: string }> = memo(({ store, id }) => {
  // Render counting is the point of these tests.
  // eslint-disable-next-line react-hooks/immutability
  renders[id] = (renders[id] ?? 0) + 1
  const row = useRow(store, id)
  return <div data-testid={`row-${id}`}>{row ? row.px : "gone"}</div>
})
Row.displayName = "Row"

function List({ store }: { store: RowStore<Quote> }) {
  // eslint-disable-next-line react-hooks/immutability
  renders.list = (renders.list ?? 0) + 1
  const ids = useRowIds(store)
  return (
    <div>
      {ids.map((id) => (
        <Row key={id} store={store} id={id} />
      ))}
    </div>
  )
}

describe("use-row-store", () => {
  it("a patch re-renders one row, not the list and not its siblings", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    store.applyDeltas({ upsert: [{ id: "a", px: 1 }, { id: "b", px: 2 }, { id: "c", px: 3 }] })
    for (const k of Object.keys(renders)) delete renders[k]
    render(<List store={store} />)
    const before = { ...renders }
    act(() => store.applyDeltas({ patch: [{ id: "b", fields: { px: 20 } }] }))
    expect(screen.getByTestId("row-b")).toHaveTextContent("20")
    expect(renders.b).toBe(before.b! + 1)
    expect(renders.a).toBe(before.a)
    expect(renders.c).toBe(before.c)
    expect(renders.list).toBe(before.list)
  })

  it("two thousand patches in one batch are one render pass", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id })
    const ids = Array.from({ length: 50 }, (_, i) => `r${i}`)
    store.applyDeltas({ upsert: ids.map((id) => ({ id, px: 0 })) })
    for (const k of Object.keys(renders)) delete renders[k]
    render(<List store={store} />)
    const before = { ...renders }
    act(() =>
      store.applyDeltas({
        patch: Array.from({ length: 2000 }, (_, i) => ({ id: ids[i % ids.length]!, fields: { px: i } })),
      }),
    )
    for (const id of ids) expect(renders[id]).toBe(before[id]! + 1)
    expect(renders.list).toBe(before.list)
  })

  it("a new row re-renders the list; a view drives the order; meta follows the batch", () => {
    const store = createRowStore<Quote>({ getRowId: (r) => r.id, lane: "ordered" })
    store.applyDeltas({ upsert: [{ id: "a", px: 1 }, { id: "b", px: 5 }] })
    const view = store.createView({ comparator: (x, y) => y.px - x.px })
    function ViewList() {
      const ids = useRowIds(view)
      const meta = useStoreMeta(store)
      return (
        <div>
          <span data-testid="ids">{ids.join(",")}</span>
          <span data-testid="meta">{`${meta.version}:${meta.size}:${meta.lane}`}</span>
        </div>
      )
    }
    render(<ViewList />)
    expect(screen.getByTestId("ids")).toHaveTextContent("b,a")
    expect(screen.getByTestId("meta")).toHaveTextContent("1:2:ordered")
    act(() => store.applyDeltas({ upsert: [{ id: "c", px: 3 }] }))
    expect(screen.getByTestId("ids")).toHaveTextContent("b,c,a")
    expect(screen.getByTestId("meta")).toHaveTextContent("2:3:ordered")
  })
})
