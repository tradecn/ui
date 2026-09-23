import { useState } from "react"
import { HotkeysProvider, useHotkey, useHotkeyList, useHotkeys } from "@/registry/tradecn/hooks/use-hotkeys"
import { formatKeys, type HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"

const BINDINGS: HotkeyBinding[] = [
  { id: "counter.increment", keys: "i", scope: "global", description: "Increment counter" },
]

function Counter() {
  const [count, setCount] = useState(0)
  const hotkeys = useHotkeys()
  const list = useHotkeyList()
  const increment = () => setCount((value) => value + 1)
  useHotkey("counter.increment", increment)
  return (
    <div className="w-72 max-w-full space-y-3 text-sm">
      {list.map((entry) => (
        <div key={entry.id} className="space-y-2">
          <label className="flex flex-wrap items-center gap-2">
            {entry.description} shortcut
            <select className="rounded border border-border bg-background px-2 py-1" value={entry.keys} onChange={(event) => hotkeys.remap(entry.id, event.target.value)}>
              <option value="i">I</option>
              <option value="u">U</option>
              <option value="">Unbound</option>
            </select>
          </label>
          <p>Current shortcut: {entry.keys ? formatKeys(entry.keys).map((step) => step.join(" + ")).join(" then ") : "Unbound"}</p>
          <button type="button" aria-label={`Reset shortcut for ${entry.description.toLowerCase()}`} className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-50" disabled={!entry.remapped} onClick={() => hotkeys.reset(entry.id)}>Reset shortcut</button>
        </div>
      ))}
      <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted" onClick={increment}>Increment</button>
      <p role="status" className="lining-nums tabular-nums">Count: {count}</p>
    </div>
  )
}

export default function UseHotkeysRemappingDemo() {
  return <HotkeysProvider bindings={BINDINGS}><Counter /></HotkeysProvider>
}
