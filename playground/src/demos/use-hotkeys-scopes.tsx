import { useState } from "react"
import { HotkeyScope, HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"

const BINDINGS: HotkeyBinding[] = [
  { id: "book.refresh", keys: "r", scope: "panel:book", description: "Refresh book", repeat: true },
]

function Book({ name }: { name: string }) {
  const [requests, setRequests] = useState(0)
  const refresh = () => setRequests((count) => count + 1)
  useHotkey("book.refresh", refresh)
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{name}</h3>
      <button type="button" aria-label={`Refresh ${name}`} className="rounded border border-border px-2 py-1 hover:bg-muted" onClick={refresh}>Refresh</button>
      <p role="status" className="lining-nums tabular-nums">Refresh requests: {requests}</p>
    </div>
  )
}

export default function UseHotkeysScopesDemo() {
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <div className="flex w-fit max-w-full flex-wrap justify-center gap-3 text-sm">
        <HotkeyScope scope="panel:book" role="region" aria-label="Book A" className="w-60 max-w-full rounded border border-border p-3 outline-none focus-within:border-ring"><Book name="Book A" /></HotkeyScope>
        <HotkeyScope scope="panel:book" role="region" aria-label="Book B" className="w-60 max-w-full rounded border border-border p-3 outline-none focus-within:border-ring"><Book name="Book B" /></HotkeyScope>
      </div>
    </HotkeysProvider>
  )
}
