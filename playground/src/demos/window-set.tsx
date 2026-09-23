import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { createWindowSet, windowSetOf, type WindowAdapter, type WindowRecord, type WindowSet } from "@/registry/tradecn/lib/window-set"

// A desk of three windows over a pretend shell that lives in this page: each window is a card, opened and
// closed through the adapter the way a Tauri WebviewWindow or an Electron BrowserWindow would be. Restore opens
// the set main first; the X on a card is the shell closing a window on its own, which the set hears; Snapshot
// reads the bounds back from the shell and prints the set as it would be stored.

const DESK: WindowSet = windowSetOf([
  { id: "main", layoutId: "desk", bounds: { x: 0, y: 0, width: 1600, height: 1000 }, main: true },
  { id: "blotters", layoutId: "blotters", bounds: { x: 1600, y: 0, width: 800, height: 1000 } },
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
  // The pretend shell: cards for windows, the listeners its X buttons fire, and bounds a little off the record's,
  // the way a window the person dragged reports where it really is.
  const [shell] = useState(() => {
    const closed = new Set<(id: string) => void>()
    const adapter: WindowAdapter = {
      open: (id, url, record) => setCards((list) => [...list, { id, url, record }]),
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
  // One controller for the page's life; the shell dies with the page, so nothing disposes it. On launch the desk is
  // restored, the way a shell's main window restores the stored set; opening is idempotent, so a second mount opens nothing twice.
  const [windows] = useState(() => createWindowSet(shell.adapter, { url: (w) => `tradecn://desk/?window=${w.id}&layout=${w.layoutId}` }))
  useEffect(() => {
    void windows.restore(DESK)
  }, [windows])
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void windows.restore(DESK)}>
          Restore the desk
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void windows.closeAll()}>
          Close all
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void windows.snapshot().then((set) => setSnapshot(JSON.stringify(set, null, 2)))}>
          Snapshot
        </Button>
      </div>
      <div className="grid min-h-28 grid-cols-3 gap-2">
        {cards.map((card) => (
          <div key={card.id} data-window={card.id} className="flex flex-col gap-1 rounded-md border border-border bg-card p-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {card.id}
                {card.record.main && <span className="ml-1 text-muted-foreground">(main)</span>}
              </span>
              <button type="button" aria-label={`Close ${card.id} from the shell`} className="text-muted-foreground hover:text-foreground" onClick={() => shell.closeFromShell(card.id)}>
                ×
              </button>
            </div>
            <span className="truncate text-muted-foreground">{card.url}</span>
            <span className="text-muted-foreground">layout {card.record.layoutId}</span>
          </div>
        ))}
        {cards.length === 0 && <p className="col-span-3 self-center text-muted-foreground">No windows open. Restore the desk to open the three again, main first.</p>}
      </div>
      {snapshot && <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-[length:var(--tradecn-text-size-grid-min)]">{snapshot}</pre>}
    </div>
  )
}
