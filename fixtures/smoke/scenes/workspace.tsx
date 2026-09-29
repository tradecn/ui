import { DeskTab } from "./recipes/workspace"
import WorkspaceTabControlsDemo, { QuoteTab } from "./recipes/workspace-tab-controls"
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { Workspace, useWorkspacePanel, useWorkspaceTab, type WorkspaceApi } from "@/components/ui/workspace"
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

const ReportOverflowLifetime = createContext<(delta: number) => void>(() => {})

function ObservedTab() {
  const { tabLocation } = useWorkspaceTab()
  const report = useContext(ReportOverflowLifetime)
  useEffect(() => {
    if (tabLocation !== "headerOverflow") return
    report(1)
    return () => report(-1)
  }, [report, tabLocation])
  return <DeskTab />
}

const PANELS = { "ws-book": Book, "ws-chart": Chart }

function seed(api: WorkspaceApi) {
  api.addPanel({ kind: "ws-book", id: "book-1", title: "Book", state: { symbol: "ZN" }, focus: false })
  api.addPanel({ kind: "ws-chart", id: "chart-1", title: "Chart", position: { reference: "book-1", direction: "right" }, focus: false })
}

function addOverflowBooks(api: WorkspaceApi) {
  for (let i = 1; i <= 6; i++) {
    if (!api.dockview.getPanel(`overflow-book-${i}`)) api.addPanel({ kind: "ws-book", id: `overflow-book-${i}`, title: `Overflow book ${i}`, focus: false, position: { reference: "book-1", direction: "within" } })
  }
}

export function WorkspaceScene() {
  const [api, setApi] = useState<WorkspaceApi | null>(null)
  const [saves, setSaves] = useState(0)
  const [tabs, setTabs] = useState<"recipe" | "default" | "observed" | "controls">("recipe")
  const [overflowAlive, setOverflowAlive] = useState(0)
  const reportOverflow = useCallback((delta: number) => setOverflowAlive((count) => count + delta), [])
  const [stored] = useState(() => parseWorkspaceLayout(localStorage.getItem(STORAGE_KEY)))
  const onLayoutChange = (layout: WorkspaceLayout) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
    setSaves((n) => n + 1)
  }
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <div data-ws-saves={saves} data-ws-overflow-alive={overflowAlive} data-ws-restored={stored ? "yes" : "no"} className="flex flex-col gap-1" style={{ width: 640 }}>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => api?.addPanel({ kind: "ws-book", title: "Book" })}>
            add book
          </button>
          <button type="button" onClick={() => api?.popout("book-1")}>
            pop out book
          </button>
          <button type="button" onClick={() => api?.float("chart-1")}>
            float chart
          </button>
          <button type="button" onClick={() => setTabs("default")}>default tabs</button>
          <button type="button" onClick={() => setTabs("observed")}>observe tabs</button>
          <button type="button" onClick={() => { if (api) addOverflowBooks(api) }}>add overflow books</button>
          <button type="button" onClick={() => {
            const book = api?.dockview.getPanel("book-1")
            if (!api || !book) return
            setTabs("controls")
            addOverflowBooks(api)
            api.dockview.addFloatingGroup(book.group, { x: 16, y: 16, width: 240, height: 180 })
          }}>floating tab controls</button>
          <button type="button" onClick={() => api?.clear()}>clear workspace</button>
        </div>
        <div style={{ height: 240 }}>
          <ReportOverflowLifetime.Provider value={reportOverflow}>
            <Workspace className="isolate" {...(tabs === "default" ? {} : { tabComponent: tabs === "observed" ? ObservedTab : tabs === "controls" ? QuoteTab : DeskTab })} panels={PANELS} defaultLayout={stored} seed={seed} onLayoutChange={onLayoutChange} layoutChangeDelay={50} onReady={setApi} />
          </ReportOverflowLifetime.Provider>
        </div>
      </div>
      <div data-workspace-controls className="mt-4 w-full max-w-160"><WorkspaceTabControlsDemo /></div>
    </HotkeysProvider>
  )
}
