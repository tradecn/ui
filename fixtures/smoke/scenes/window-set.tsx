import { useState } from "react"
import { createWindowSet, parseWindowSet, windowSetOf, type WindowAdapter } from "@/lib/window-set"

// A desk of two windows over a pretend shell in the scene: the set opens them main first, a close through the
// set and one the shell made on its own both leave it, and a snapshot carries the bounds the shell reports.
const DESK = windowSetOf([
  { id: "main", layoutId: "desk", bounds: { x: 0, y: 0, width: 1600, height: 1000 }, main: true },
  { id: "blotters", layoutId: "blotters", bounds: { x: 1600, y: 0, width: 800, height: 1000 } },
])

export function WindowSetScene() {
  const [open, setOpen] = useState<string[]>([])
  const [snapshot, setSnapshot] = useState("")
  const [shell] = useState(() => {
    const closed = new Set<(id: string) => void>()
    const adapter: WindowAdapter = {
      open: (id) => setOpen((list) => [...list, id]),
      close: (id) => setOpen((list) => list.filter((x) => x !== id)),
      onClosed: (cb) => {
        closed.add(cb)
        return () => closed.delete(cb)
      },
      // The shell says the main window was dragged; it has no word on the other.
      bounds: (id) => (id === "main" ? { x: 40, y: 20, width: 1500, height: 900 } : null),
    }
    const closeFromShell = (id: string) => {
      setOpen((list) => list.filter((x) => x !== id))
      for (const cb of closed) cb(id)
    }
    return { adapter, closeFromShell }
  })
  const [windows] = useState(() => createWindowSet(shell.adapter, { url: (w) => `app://${w.id}/${w.layoutId}` }))
  const snap = () =>
    windows.snapshot().then((set) => {
      const parsed = parseWindowSet(JSON.stringify(set))
      setSnapshot(`${set.windows.map((w) => `${w.id}@${w.bounds?.x ?? "?"},${w.bounds?.y ?? "?"}`).join(" ")}|${parsed?.windows.length ?? "x"}`)
    })
  return (
    <div data-slot="tradecn-window-set" className="flex flex-col gap-1">
      <output data-window-open="">{open.join(",")}</output>
      <output data-window-snapshot="">{snapshot}</output>
      <button type="button" onClick={() => void windows.restore(DESK)}>
        restore
      </button>
      <button type="button" onClick={() => void windows.close("blotters")}>
        close blotters
      </button>
      <button type="button" onClick={() => shell.closeFromShell("main")}>
        shell closes main
      </button>
      <button type="button" onClick={() => void snap()}>
        snapshot
      </button>
    </div>
  )
}
