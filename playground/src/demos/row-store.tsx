import { memo, useEffect, useMemo } from "react"
import { useRow, useRowIds, useStoreMeta } from "@/registry/tradecn/hooks/use-row-store"
import { formatPrice, formatSigned } from "@/registry/tradecn/lib/format"
import { createFrameBatcher, createRowStore, type RowStore } from "@/registry/tradecn/lib/row-store"

interface Quote {
  id: string
  px: number
  chg: number
}

const IDS = Array.from({ length: 12 }, (_, i) => `I${String(i + 1).padStart(2, "0")}`)

// What a feed handler looks like: one message at a time into the batcher, one store write per frame.
function usePublisher() {
  const store = useMemo(() => createRowStore<Quote>({ getRowId: (q) => q.id }), [])
  useEffect(() => {
    store.applyDeltas({ upsert: IDS.map((id) => ({ id, px: 100, chg: 0 })) })
    const batcher = createFrameBatcher<Quote>(store.applyDeltas, { getRowId: (q) => q.id })
    let alive = true
    const tick = () => {
      if (!alive) return
      for (let i = 0; i < 40; i++) {
        const id = IDS[Math.floor(Math.random() * IDS.length)]!
        const row = store.getRow(id)!
        const d = (Math.random() - 0.5) * 0.02
        batcher.push({ patch: [{ id, fields: { px: row.px + d, chg: row.chg + d } }] })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return () => {
      alive = false
      batcher.cancel()
    }
  }, [store])
  return store
}

// Subscribes to one row: it re-renders when that row changes and not when its neighbours do.
const Row = memo(function Row({ store, id }: { store: RowStore<Quote>; id: string }) {
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

export default function RowStoreDemo() {
  const store = usePublisher()
  // A view sorts without touching the store. Touch it and the order holds for 1.5 s, so a click lands where it aimed.
  const view = useMemo(() => store.createView({ comparator: (a, b) => b.chg - a.chg, reorderHoldMs: 1500 }), [store])
  const ids = useRowIds(view)
  const meta = useStoreMeta(store)
  return (
    <div className="font-(family-name:--tradecn-font-mono) text-xs lining-nums tabular-nums" onPointerDown={() => view.touch()}>
      <p className="mb-2 text-muted-foreground">Sorted by change, 40 patches a frame. Batch {meta.version}. Press anywhere and the order holds.</p>
      <table className="w-full">
        <tbody>
          {ids.map((id) => (
            <Row key={id} store={store} id={id} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
