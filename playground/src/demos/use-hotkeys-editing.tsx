import { useState } from "react"
import { HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"

const BINDINGS: HotkeyBinding[] = [
  { id: "app.refresh", keys: "r", scope: "global", description: "Refresh" },
  { id: "note.save", keys: "mod+enter", scope: "editing", description: "Save note" },
]

function Note() {
  const [refreshes, setRefreshes] = useState(0)
  const [saves, setSaves] = useState(0)
  const refresh = () => setRefreshes((count) => count + 1)
  const save = () => setSaves((count) => count + 1)
  useHotkey("app.refresh", refresh)
  useHotkey("note.save", save)
  return (
    <div className="w-80 max-w-full space-y-3 text-sm">
      <label className="flex flex-col gap-2">Note<textarea className="h-20 w-full resize-none rounded border border-input bg-background px-2 py-1" placeholder="Type r here" /></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted" onClick={refresh}>Refresh</button>
        <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted" onClick={save}>Request save</button>
      </div>
      <p role="status" className="lining-nums tabular-nums">Refresh requests: {refreshes}. Save requests: {saves}.</p>
    </div>
  )
}

export default function UseHotkeysEditingDemo() {
  return <HotkeysProvider bindings={BINDINGS}><Note /></HotkeysProvider>
}
