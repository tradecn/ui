import { useState } from "react"
import { Button } from "@/components/ui/button"
import { createPreferences, exportPreferences, type Preferences } from "@/registry/tradecn/lib/preferences"
import { WINDOW_SET_SLOT, createWindowSet, parseWindowSet, windowSetOf, writeWindowSet, type WindowAdapter, type WindowRecord, type WindowSet } from "@/registry/tradecn/lib/window-set"

// The window set over a pretend shell in the page: restore a desk of three windows, open one more, close from the
// set or from the shell's own X, snapshot the bounds back, write the set into a preferences envelope under the
// template boundary, and parse it back from the text.

const DESK: WindowSet = windowSetOf([
  { id: "main", layoutId: "desk", bounds: { x: 0, y: 0, width: 1600, height: 1000 }, main: true },
  { id: "blotters", layoutId: "blotters", bounds: { x: 1600, y: 0, width: 800, height: 1000 } },
  { id: "charts", layoutId: "charts", bounds: { x: 0, y: 1000, width: 2400, height: 600 }, display: "second" },
])
const EXTRA: WindowRecord = { id: "risk", layoutId: "risk", bounds: { x: 2400, y: 0, width: 800, height: 1600 }, display: "third" }

interface Card {
  id: string
  url: string
  record: WindowRecord
}

export function WindowSetScene() {
  const [cards, setCards] = useState<Card[]>([])
  const [log, setLog] = useState<string[]>([])
  const [text, setText] = useState("")
  const say = (line: string) => setLog((lines) => [line, ...lines].slice(0, 8))
  const [shell] = useState(() => {
    const closed = new Set<(id: string) => void>()
    const adapter: WindowAdapter = {
      open: (id, url, record) => {
        say(`shell opened ${id} at ${url}`)
        setCards((list) => [...list, { id, url, record }])
      },
      close: (id) => {
        say(`shell closed ${id}`)
        setCards((list) => list.filter((card) => card.id !== id))
      },
      onClosed: (cb) => {
        closed.add(cb)
        return () => closed.delete(cb)
      },
      bounds: (id) => {
        const record = [...DESK.windows, EXTRA].find((w) => w.id === id)
        return record?.bounds ? { ...record.bounds, x: record.bounds.x + 24, y: record.bounds.y + 24 } : null
      },
    }
    const closeFromShell = (id: string) => {
      say(`the person closed ${id}`)
      setCards((list) => list.filter((card) => card.id !== id))
      for (const cb of closed) cb(id)
    }
    return { adapter, closeFromShell }
  })
  const [windows] = useState(() => createWindowSet(shell.adapter, { url: (w) => `tradecn://desk/?window=${w.id}&layout=${w.layoutId}` }))
  const snapshot = async () => {
    const set = await windows.snapshot()
    let prefs: Preferences = createPreferences({ template: [WINDOW_SET_SLOT] })
    prefs = writeWindowSet(prefs, set)
    setText(exportPreferences(prefs, { boundary: "template", indent: 2 }))
    say(`snapshot: ${set.windows.length} window(s)`)
  }
  const parsed = parseWindowSet(text ? JSON.parse(text).slots?.[WINDOW_SET_SLOT]?.value : null)
  return (
    <main className="flex h-screen flex-col gap-3 p-4 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold">window-set</h1>
        <span className="text-muted-foreground">The windows a desk has, over a pretend shell: cards for windows, the X for the shell's own close.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void windows.restore(DESK)}>
          Restore the desk
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void windows.open(EXTRA)}>
          Open the risk window
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void windows.close("blotters")}>
          Close the blotters
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void windows.closeAll()}>
          Close all
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void snapshot()}>
          Snapshot into preferences
        </Button>
      </div>
      <div className="grid min-h-28 grid-cols-4 gap-2">
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
            <span className="text-muted-foreground">
              layout {card.record.layoutId}
              {card.record.display ? ` · ${card.record.display}` : ""}
            </span>
          </div>
        ))}
        {cards.length === 0 && <p className="col-span-4 self-center text-muted-foreground">No windows open.</p>}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <div className="flex min-h-0 flex-col gap-1">
          <span className="text-muted-foreground">The shell heard</span>
          <ul className="min-h-0 flex-1 overflow-auto rounded-md border border-border p-2 font-(family-name:--tradecn-font-mono)">
            {log.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="flex min-h-0 flex-col gap-1">
          <span className="text-muted-foreground">The envelope, template boundary{parsed ? ` · parses back to ${parsed.windows.length} window(s)` : ""}</span>
          <pre className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-muted/40 p-2">{text || "Snapshot to see the set as it would be stored."}</pre>
        </div>
      </div>
    </main>
  )
}
