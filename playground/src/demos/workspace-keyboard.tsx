import { useState } from "react"
import { HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import { PanelContent } from "@/registry/tradecn/ui/panel"
import { Workspace, type WorkspaceApi } from "@/registry/tradecn/ui/workspace"

const BINDINGS: HotkeyBinding[] = [
  { id: "workspace.next", keys: "]", scope: "global", description: "Next panel" },
  { id: "workspace.previous", keys: "[", scope: "global", description: "Previous panel" },
  { id: "workspace.new", keys: "n q", scope: "global", description: "New quotes panel" },
  { id: "workspace.close", keys: "w", scope: "global", description: "Close the active panel" },
  { id: "quotes.refresh", keys: "r", scope: "panel:quotes", description: "Refresh quotes" },
]

function Quotes() {
  const [requests, setRequests] = useState(0)
  const refresh = () => setRequests((count) => count + 1)
  useHotkey("quotes.refresh", refresh)
  return (
    <PanelContent className="space-y-2 p-3">
      <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted" onClick={refresh}>Refresh</button>
      <p role="status">Refresh requests: {requests}</p>
    </PanelContent>
  )
}

const PANELS = { quotes: Quotes }

function Keys({ api }: { api: WorkspaceApi | null }) {
  useHotkey("workspace.next", () => api?.focusNext())
  useHotkey("workspace.previous", () => api?.focusNext(-1))
  useHotkey("workspace.new", () => api?.addPanel({ kind: "quotes", title: "Quotes" }))
  useHotkey("workspace.close", () => {
    const id = api?.activePanel()
    if (id) api?.closePanel(id)
  })
  return null
}

export default function WorkspaceKeyboardDemo() {
  const [api, setApi] = useState<WorkspaceApi | null>(null)
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <Keys api={api} />
      <Workspace
        className="h-64 rounded-md border border-border"
        panels={PANELS}
        onReady={setApi}
        seed={(api) => {
          const first = api.addPanel({ kind: "quotes", title: "Treasury quotes" })
          api.addPanel({ kind: "quotes", title: "Equity quotes", position: { reference: first, direction: "right" } })
        }}
        watermark="No panels. Press n q to add one."
      />
    </HotkeysProvider>
  )
}
