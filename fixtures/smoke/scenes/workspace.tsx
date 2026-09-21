import { useState } from "react"
import { Workspace, useWorkspacePanel, type WorkspaceApi } from "@/components/ui/workspace"
import { HotkeysProvider, useHotkey } from "@/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/lib/hotkeys"
import { parseWorkspaceLayout, type WorkspaceLayout } from "@/lib/workspace-layout"

const STORAGE_KEY = "tradecn-smoke-workspace"

const BINDINGS: HotkeyBinding[] = [
  { id: "smoke.ws-book-key", keys: "k", scope: "panel:ws-book", description: "Book key" },
  { id: "smoke.ws-chart-key", keys: "k", scope: "panel:ws-chart", description: "Chart key" },
]

function Book() {
  const panel = useWorkspacePanel()
  const [keys, setKeys] = useState(0)
  useHotkey("smoke.ws-book-key", () => setKeys((n) => n + 1))
  return (
    <div data-ws-book={panel.id} data-ws-keys={keys} data-ws-location={panel.location} className="p-2">
      <output data-ws-symbol>{String(panel.state.symbol ?? "")}</output>
      <button type="button" onClick={() => panel.setState({ symbol: "ES" })}>
        to ES
      </button>
    </div>
  )
}

function Chart() {
  const panel = useWorkspacePanel()
  const [keys, setKeys] = useState(0)
  useHotkey("smoke.ws-chart-key", () => setKeys((n) => n + 1))
  return <div data-ws-chart={panel.id} data-ws-keys={keys} className="p-2" />
}

const PANELS = { "ws-book": Book, "ws-chart": Chart }

function seed(api: WorkspaceApi) {
  api.addPanel({ kind: "ws-book", id: "book-1", title: "Book", state: { symbol: "ZN" }, focus: false })
  api.addPanel({ kind: "ws-chart", id: "chart-1", title: "Chart", position: { reference: "book-1", direction: "right" }, focus: false })
}

export function WorkspaceScene() {
  const [api, setApi] = useState<WorkspaceApi | null>(null)
  const [saves, setSaves] = useState(0)
  const [stored] = useState(() => parseWorkspaceLayout(localStorage.getItem(STORAGE_KEY)))
  const onLayoutChange = (layout: WorkspaceLayout) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
    setSaves((n) => n + 1)
  }
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <div data-ws-saves={saves} data-ws-restored={stored ? "yes" : "no"} className="flex flex-col gap-1" style={{ width: 640 }}>
        <div className="flex gap-2">
          <button type="button" onClick={() => api?.addPanel({ kind: "ws-book", title: "Book" })}>
            add book
          </button>
          <button type="button" onClick={() => api?.popout("book-1")}>
            pop out book
          </button>
          <button type="button" onClick={() => api?.float("chart-1")}>
            float chart
          </button>
        </div>
        <div style={{ height: 240 }}>
          <Workspace panels={PANELS} defaultLayout={stored} seed={seed} onLayoutChange={onLayoutChange} layoutChangeDelay={50} onReady={setApi} />
        </div>
      </div>
    </HotkeysProvider>
  )
}
