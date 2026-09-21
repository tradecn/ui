import { useCallback, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import { LinkGroupProvider, useLinkGroup } from "@/registry/tradecn/hooks/use-link-group"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import type { LinkGroup } from "@/registry/tradecn/lib/link-group"
import { parseWorkspaceLayout, type WorkspaceLayout } from "@/registry/tradecn/lib/workspace-layout"
import { LinkGroupDot, PanelActions, PanelContent, PanelHeader, SymbolTag } from "@/registry/tradecn/ui/panel"
import { Sparkline } from "@/registry/tradecn/ui/sparkline"
import { Workspace, useWorkspacePanel, type WorkspaceApi } from "@/registry/tradecn/ui/workspace"

const STORAGE_KEY = "tradecn-playground-workspace"

const BINDINGS: HotkeyBinding[] = [
  { id: "workspace.next", keys: "]", scope: "global", description: "Next panel" },
  { id: "workspace.previous", keys: "[", scope: "global", description: "Previous panel" },
  { id: "workspace.book", keys: "n b", scope: "global", description: "New book" },
  { id: "workspace.chart", keys: "n c", scope: "global", description: "New chart" },
  { id: "workspace.close", keys: "w", scope: "global", description: "Close the active panel" },
  { id: "book.next", keys: "j", scope: "panel:book", description: "Next order", repeat: true },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order" },
]

const KNOWN = new Set(["ZN", "ZB", "ZF", "ZT", "ES", "NQ", "CL", "GC"])
const ORDERS = ["BUY 5mm 99-16+", "SELL 2mm 99-17", "BUY 10mm 99-15+", "SELL 1mm 99-18"]

// A made-up price path per symbol, the same one every time.
function series(symbol: string): number[] {
  const seed = [...symbol].reduce((n, c) => n + c.charCodeAt(0), 0)
  const out: number[] = []
  let px = 100
  for (let i = 0; i < 60; i++) out.push((px += Math.sin(i / 4 + seed) * 0.4 + Math.cos(i / 9 + seed) * 0.2))
  return out
}

function Actions() {
  const panel = useWorkspacePanel()
  return (
    <PanelActions>
      <Button size="sm" variant="ghost" className="h-5 px-1.5 text-xs" onClick={() => panel.float()} disabled={panel.location !== "grid"}>
        float
      </Button>
      <Button size="sm" variant="ghost" className="h-5 px-1.5 text-xs" onClick={() => panel.popout()} disabled={panel.location === "popout"}>
        pop out
      </Button>
      <Button size="sm" variant="ghost" className="h-5 px-1.5 text-xs" onClick={panel.toggleMaximize}>
        max
      </Button>
    </PanelActions>
  )
}

function Book() {
  const panel = useWorkspacePanel()
  const link = useLinkGroup({
    source: panel.id,
    defaultGroup: (panel.state.group as LinkGroup | undefined) ?? null,
    defaultSymbol: (panel.state.symbol as string | undefined) ?? "ZN",
    onGroupChange: (group) => panel.setState({ group }),
    onSymbolChange: (symbol) => panel.setState({ symbol }),
  })
  const [orders, setOrders] = useState(ORDERS)
  const [selected, setSelected] = useState(0)
  useHotkey("book.next", () => setSelected((i) => (orders.length ? (i + 1) % orders.length : 0)))
  useHotkey("book.cancel", () => {
    setOrders((list) => list.filter((_, i) => i !== selected))
    setSelected((i) => Math.max(0, Math.min(i, orders.length - 2)))
  })
  return (
    <>
      <PanelHeader>
        <SymbolTag value={link.symbol} onCommit={link.setSymbol} validate={(s) => KNOWN.has(s)} />
        <LinkGroupDot group={link.group} onGroupChange={link.setGroup} />
        <Actions />
      </PanelHeader>
      <PanelContent className="p-2">
        <ul>
          {orders.map((order, i) => (
            <li key={order} className={i === selected ? "bg-muted px-1" : "px-1"}>
              {link.symbol} {order}
            </li>
          ))}
          {!orders.length && <li className="text-muted-foreground">empty</li>}
        </ul>
      </PanelContent>
    </>
  )
}

function Chart() {
  const panel = useWorkspacePanel()
  const link = useLinkGroup({
    source: panel.id,
    defaultGroup: (panel.state.group as LinkGroup | undefined) ?? null,
    defaultSymbol: (panel.state.symbol as string | undefined) ?? "ZN",
    onGroupChange: (group) => panel.setState({ group }),
    onSymbolChange: (symbol) => panel.setState({ symbol }),
  })
  const values = useMemo(() => series(link.symbol ?? ""), [link.symbol])
  return (
    <>
      <PanelHeader>
        <SymbolTag value={link.symbol} onCommit={link.setSymbol} validate={(s) => KNOWN.has(s)} />
        <LinkGroupDot group={link.group} onGroupChange={link.setGroup} />
        <Actions />
      </PanelHeader>
      <PanelContent className="p-2">
        <Sparkline values={values} label={link.symbol ?? "chart"} className="h-full w-full" interactive />
      </PanelContent>
    </>
  )
}

const PANELS = { book: Book, chart: Chart }

function Keys({ api }: { api: WorkspaceApi | null }) {
  useHotkey("workspace.next", () => api?.focusNext())
  useHotkey("workspace.previous", () => api?.focusNext(-1))
  useHotkey("workspace.book", () => api?.addPanel({ kind: "book", title: "Order book" }))
  useHotkey("workspace.chart", () => api?.addPanel({ kind: "chart", title: "Chart" }))
  useHotkey("workspace.close", () => {
    const id = api?.activePanel()
    if (id) api?.closePanel(id)
  })
  return null
}

function seed(api: WorkspaceApi) {
  api.addPanel({ kind: "book", title: "Order book", state: { symbol: "ZN", group: 1 } })
  api.addPanel({ kind: "chart", title: "Chart", state: { symbol: "ZN", group: 1 }, position: { reference: "book-1", direction: "right" } })
  api.addPanel({ kind: "book", title: "Order book", state: { symbol: "ES" }, position: { reference: "book-1", direction: "below" } })
}

export function WorkspaceScene() {
  const [api, setApi] = useState<WorkspaceApi | null>(null)
  const [saved, setSaved] = useState<{ at: string; bytes: number; panels: number } | null>(null)
  const [stored] = useState(() => parseWorkspaceLayout(localStorage.getItem(STORAGE_KEY)))
  const onLayoutChange = useCallback((layout: WorkspaceLayout) => {
    const text = JSON.stringify(layout)
    localStorage.setItem(STORAGE_KEY, text)
    setSaved({ at: new Date().toLocaleTimeString(), bytes: text.length, panels: Object.keys(layout.panels).length })
  }, [])
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <LinkGroupProvider>
        <Keys api={api} />
        <main className="flex h-screen flex-col gap-2 p-4 font-mono text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sm font-semibold">workspace</h1>
            <span className="text-muted-foreground">
              Drag tabs to dock them, Shift+drag to float. <kbd>]</kbd> and <kbd>[</kbd> move between panels, <kbd>n b</kbd> and <kbd>n c</kbd> open a book or a chart, <kbd>w</kbd> closes the active one, <kbd>j</kbd> and <kbd>x</kbd> act on the book with focus. The layout is saved to
              localStorage as you go; reload to see it come back.
            </span>
            <span className="ml-auto text-muted-foreground" data-saved>
              {saved ? `saved ${saved.at}, ${saved.panels} panels, ${saved.bytes} bytes` : stored ? "restored from localStorage" : "seeded"}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY)
                if (api) {
                  api.clear()
                  seed(api)
                }
              }}
            >
              reset
            </Button>
          </div>
          <Workspace className="min-h-0 flex-1 rounded-md border border-border" panels={PANELS} defaultLayout={stored} seed={seed} onLayoutChange={onLayoutChange} onReady={setApi} popoutUrl="/popout.html" watermark="No panels. Press n b for a book." />
        </main>
      </LinkGroupProvider>
    </HotkeysProvider>
  )
}
