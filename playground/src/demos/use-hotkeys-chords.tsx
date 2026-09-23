import { useState } from "react"
import { HotkeysProvider, useHotkey, usePendingChord } from "@/registry/tradecn/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"

const BINDINGS: HotkeyBinding[] = [
  { id: "go.blotter", keys: "g b", scope: "global", description: "Show blotter" },
  { id: "go.watchlist", keys: "g w", scope: "global", description: "Show watchlist" },
]

function Views() {
  const [view, setView] = useState("Home")
  const pending = usePendingChord()
  useHotkey("go.blotter", () => setView("Blotter"))
  useHotkey("go.watchlist", () => setView("Watchlist"))
  return (
    <div className="w-fit max-w-full space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted" onClick={() => setView("Blotter")}>Show blotter</button>
        <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted" onClick={() => setView("Watchlist")}>Show watchlist</button>
      </div>
      <p role="status">{pending ? `Chord: ${pending} …` : `View: ${view}`}</p>
    </div>
  )
}

export default function UseHotkeysChordsDemo() {
  return <HotkeysProvider bindings={BINDINGS}><Views /></HotkeysProvider>
}
