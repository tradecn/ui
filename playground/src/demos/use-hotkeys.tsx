import { useState } from "react"
import { HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"

const BINDINGS: HotkeyBinding[] = [
  { id: "counter.increment", keys: "i", scope: "global", description: "Increment counter" },
]

function Counter() {
  const [count, setCount] = useState(0)
  const increment = () => setCount((value) => value + 1)
  useHotkey("counter.increment", increment)
  return (
    <div className="w-fit max-w-full space-y-3 text-sm">
      <button type="button" className="rounded border border-border px-3 py-2 hover:bg-muted" onClick={increment}>Increment</button>
      <p role="status" className="lining-nums tabular-nums">Count: {count}</p>
    </div>
  )
}

export default function UseHotkeysDemo() {
  return <HotkeysProvider bindings={BINDINGS}><Counter /></HotkeysProvider>
}
