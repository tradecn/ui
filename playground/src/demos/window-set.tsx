import { useEffect, useRef, useState } from "react"
import { createWindowSet, windowSetOf, type WindowAdapter, type WindowRecord, type WindowSet, type WindowSetController } from "@/registry/tradecn/lib/window-set"

const DESK: WindowSet = windowSetOf([
  { id: "blotters", layoutId: "blotters", bounds: { x: 1600, y: 0, width: 800, height: 1000 } },
  { id: "main", layoutId: "desk", bounds: { x: 0, y: 0, width: 1600, height: 1000 }, main: true },
  { id: "charts", layoutId: "charts", bounds: { x: 0, y: 1000, width: 2400, height: 600 }, display: "second" },
])

interface Card {
  id: string
  url: string
  record: WindowRecord
}

export default function WindowSetDemo() {
  const [cards, setCards] = useState<Card[]>([])
  const [snapshot, setSnapshot] = useState("")
  const [shell] = useState(() => {
    const closed = new Set<(id: string) => void>()
    const adapter: WindowAdapter = {
      open: (id, url, record) => setCards((list) => list.some((card) => card.id === id) ? list : [...list, { id, url, record }]),
      close: (id) => setCards((list) => list.filter((card) => card.id !== id)),
      onClosed: (cb) => {
        closed.add(cb)
        return () => closed.delete(cb)
      },
      bounds: (id) => {
        const record = DESK.windows.find((w) => w.id === id)
        return record?.bounds ? { ...record.bounds, x: record.bounds.x + 24, y: record.bounds.y + 24 } : null
      },
    }
    const closeFromShell = (id: string) => {
      setCards((list) => list.filter((card) => card.id !== id))
      for (const cb of closed) cb(id)
    }
    return { adapter, closeFromShell }
  })
  const windows = useRef<WindowSetController | null>(null)
  useEffect(() => {
    const controller = createWindowSet(shell.adapter, { url: (w) => `tradecn://desk/?window=${w.id}&layout=${w.layoutId}` })
    windows.current = controller
    return () => {
      windows.current = null
      controller.dispose()
    }
  }, [shell])
  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded-md border border-border px-2 py-1" onClick={() => void windows.current?.restore(DESK)}>Restore the desk</button>
        <button type="button" className="rounded-md border border-border px-2 py-1" onClick={() => void windows.current?.closeAll()}>Close all</button>
        <button type="button" className="rounded-md border border-border px-2 py-1" onClick={() => void windows.current?.snapshot().then((set) => setSnapshot(JSON.stringify(set, null, 2)))}>Snapshot</button>
      </div>
      <div className="w-2xl max-w-full space-y-3 text-xs lining-nums tabular-nums">
        <p className="text-muted-foreground">A simulated shell: restore three windows, close a card, then take a snapshot. No native windows open.</p>
        {cards.length > 0 ? (
          <ul role="list" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {cards.map((card) => (
              <li key={card.id} data-window={card.id} className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-card p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{card.id}{card.record.main && <span className="ml-1 text-muted-foreground"> (main)</span>}</span>
                  <button type="button" aria-label={`Close ${card.id} from the shell`} className="px-1 text-muted-foreground hover:text-foreground" onClick={() => shell.closeFromShell(card.id)}>×</button>
                </div>
                <span className="break-all font-(family-name:--tradecn-font-mono) text-muted-foreground">{card.url}</span>
                <span className="text-muted-foreground">layout {card.record.layoutId}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex min-h-28 items-center justify-center text-muted-foreground">No windows open. Restore the desk to open main first.</p>
        )}
        {snapshot && <pre tabIndex={0} role="region" aria-label="Window set snapshot" className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-(family-name:--tradecn-font-mono) text-xs">{snapshot}</pre>}
      </div>
    </>
  )
}
