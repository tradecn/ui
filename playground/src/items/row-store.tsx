import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useRow, useRowIds, useStoreMeta } from "@/registry/tradecn/hooks/use-row-store"
import { formatPrice, formatSigned } from "@/registry/tradecn/lib/format"
import { createFrameBatcher, createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"

interface Quote {
  id: string
  px: number
  chg: number
}

const N = 200
const UPDATES_PER_FRAME = 400

// A synthetic message-at-a-time publisher through the frame batcher: what a WebSocket consumer looks like.
function usePublisher() {
  const store = useMemo(() => createRowStore<Quote>({ getRowId: (q) => q.id }), [])
  const renders = useRef(0)
  useEffect(() => {
    const ids = Array.from({ length: N }, (_, i) => `I${String(i).padStart(3, "0")}`)
    store.applyDeltas({ upsert: ids.map((id) => ({ id, px: 100, chg: 0 })) })
    const batcher = createFrameBatcher<Quote>(store.applyDeltas, { getRowId: (q) => q.id })
    let alive = true
    const tick = () => {
      if (!alive) return
      for (let i = 0; i < UPDATES_PER_FRAME; i++) {
        const id = ids[Math.floor(Math.random() * N)]!
        const row = store.getRow(id)!
        const d = (Math.random() - 0.5) * 0.02
        batcher.push({ patch: [{ id, fields: { px: row.px + d, chg: row.chg + d } }], meta: { dropped: Math.random() < 0.01 ? 1 : 0 } })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return () => {
      alive = false
      batcher.cancel()
    }
  }, [store])
  return { store, renders }
}

const Row = memo(function Row({ store, id, rendersRef }: { store: RowStore<Quote>; id: string; rendersRef: RefObject<number> }) {
  // A render counter for the scene's readout; not a pattern for real components.
  // eslint-disable-next-line react-hooks/refs
  rendersRef.current++
  const q = useRow(store, id)
  if (!q) return null
  return (
    <tr className="border-b border-border">
      <td className="py-0.5 pr-4 text-muted-foreground">{id}</td>
      <td className="py-0.5 text-right">{formatPrice(q.px, { kind: "decimal", decimals: 3 })}</td>
      <td className={`py-0.5 pl-4 text-right ${q.chg > 0 ? "text-up" : q.chg < 0 ? "text-down" : "text-flat"}`}>{formatSigned(q.chg, { decimals: 3 })}</td>
    </tr>
  )
})

export function RowStoreScene() {
  const { store, renders } = usePublisher()
  const view = useMemo(() => store.createView({ comparator: (a, b) => b.chg - a.chg, reorderHoldMs: 1500 }), [store])
  const ids = useRowIds(view)
  const meta = useStoreMeta(store)
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <main className="mx-auto max-w-xl p-6 font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums" onPointerDown={() => view.touch()} onKeyDown={() => view.touch()}>
      <h1 className="mb-2 text-sm font-semibold">row-store</h1>
      <p className="mb-4 text-muted-foreground">
        {N} rows, {UPDATES_PER_FRAME} patches per frame through the batcher. batch {meta.version}, dropped {meta.dropped}, row renders {renders.current}. Sorted by change; click to hold the order for 1.5 s.
      </p>
      <table className="w-full">
        <tbody>
          {ids.slice(0, 25).map((id) => (
            <Row key={id} store={store} id={id} rendersRef={renders} />
          ))}
        </tbody>
      </table>
    </main>
  )
}
