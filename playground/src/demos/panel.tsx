import { useState } from "react"
import { Button } from "@/components/ui/button"
import { HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import { LinkGroupProvider, useLinkGroup } from "@/registry/tradecn/hooks/use-link-group"
import { usePopout } from "@/registry/tradecn/hooks/use-popout"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import type { LinkGroup } from "@/registry/tradecn/lib/link-group"
import { LinkGroupDot, Panel, PanelActions, PanelContent, PanelHeader, PanelPopout, PanelTitle, SymbolTag } from "@/registry/tradecn/ui/panel"

const BINDINGS: HotkeyBinding[] = [
  { id: "book.next", keys: "j", scope: "panel:book", description: "Next order", repeat: true },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order" },
]

const KNOWN = new Set(["ZN", "ZB", "ZF", "ZT", "ES", "NQ", "CL", "GC"])
const ORDERS = ["BUY 5mm 99-16+", "SELL 2mm 99-17", "BUY 10mm 99-15+"]

// A panel is a HotkeyScope of its kind: j and x act on the book with focus. A link group shares the symbol.
function Book({ id, group, symbol }: { id: string; group: LinkGroup; symbol: string }) {
  const link = useLinkGroup({ source: id, defaultGroup: group, defaultSymbol: symbol })
  const [orders, setOrders] = useState(ORDERS)
  const [selected, setSelected] = useState(0)
  const popout = usePopout({ title: `${id} ${link.symbol ?? ""}`, width: 360, height: 240 })
  useHotkey("book.next", () => setSelected((i) => (orders.length ? (i + 1) % orders.length : 0)))
  useHotkey("book.cancel", () => {
    setOrders((list) => list.filter((_, i) => i !== selected))
    setSelected((i) => Math.max(0, Math.min(i, orders.length - 2)))
  })
  return (
    <PanelPopout
      popout={popout}
      placeholder={
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
          <Button size="sm" variant="outline" onClick={popout.close}>
            {id} is in its own window. Bring it back
          </Button>
        </div>
      }
    >
      <Panel kind="book" className="h-40">
        <PanelHeader>
          <PanelTitle>{id}</PanelTitle>
          <SymbolTag value={link.symbol} onCommit={link.setSymbol} validate={(s) => KNOWN.has(s)} />
          <LinkGroupDot group={link.group} onGroupChange={link.setGroup} />
          <PanelActions>
            <Button size="sm" variant="ghost" className="h-5 px-1.5 text-xs" onClick={popout.isOpen ? popout.close : popout.open}>
              {popout.isOpen ? "dock" : "pop out"}
            </Button>
          </PanelActions>
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
      </Panel>
    </PanelPopout>
  )
}

function States() {
  const [state, setState] = useState<"auto" | "active" | "dragTarget" | "error">("auto")
  return (
    <Panel kind="states" className="h-40" active={state === "active" ? true : undefined} dragTarget={state === "dragTarget"} error={state === "error"}>
      <PanelHeader>
        <PanelTitle>Border states</PanelTitle>
      </PanelHeader>
      <PanelContent className="flex flex-wrap content-start gap-1 p-2">
        {(["auto", "active", "dragTarget", "error"] as const).map((s) => (
          <Button key={s} size="sm" variant={s === state ? "default" : "outline"} onClick={() => setState(s)}>
            {s}
          </Button>
        ))}
      </PanelContent>
    </Panel>
  )
}

export default function PanelDemo() {
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <LinkGroupProvider>
        <div className="space-y-3 font-(family-name:--tradecn-font-mono) text-xs">
          <p className="text-muted-foreground">Book A and Book B are in link group 1: retype one symbol and the other follows. Click a book, then j and x act on that book only. Pop one out and its state, keys, and link come along.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Book id="Book A" group={1} symbol="ZN" />
            <Book id="Book B" group={1} symbol="ES" />
            <Book id="Book C" group={null} symbol="CL" />
            <States />
          </div>
        </div>
      </LinkGroupProvider>
    </HotkeysProvider>
  )
}
