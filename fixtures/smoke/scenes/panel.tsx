import { useState } from "react"
import { LinkGroupDot, Panel, PanelActions, PanelContent, PanelHeader, PanelTitle, SymbolTag } from "@/components/ui/panel"
import { HotkeysProvider, useHotkey } from "@/hooks/use-hotkeys"
import { LinkGroupProvider, useLinkGroup } from "@/hooks/use-link-group"
import type { HotkeyBinding } from "@/lib/hotkeys"

const BINDINGS: HotkeyBinding[] = [{ id: "smoke.panel-key", keys: "k", scope: "panel:smoke-panel", description: "Panel key" }]

function Book() {
  const link = useLinkGroup({ source: "book", defaultGroup: 1, defaultSymbol: "ZN" })
  const [keys, setKeys] = useState(0)
  useHotkey("smoke.panel-key", () => setKeys((n) => n + 1))
  return (
    <Panel kind="smoke-panel" className="h-24 w-72" data-panel-keys={keys}>
      <PanelHeader>
        <PanelTitle>Book</PanelTitle>
        <SymbolTag value={link.symbol} onCommit={link.setSymbol} />
        <LinkGroupDot group={link.group} onGroupChange={link.setGroup} />
        <PanelActions>
          <button type="button">close</button>
        </PanelActions>
      </PanelHeader>
      <PanelContent>rows</PanelContent>
    </Panel>
  )
}

// Not a panel, so the scene still shows one tradecn slot. It is in the book's group and says what it sees.
function Follower() {
  const link = useLinkGroup({ source: "follower", defaultGroup: 1 })
  return <output data-panel-follower={link.symbol ?? ""} />
}

export function PanelScene() {
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <LinkGroupProvider transport={null}>
        <Book />
        <Follower />
      </LinkGroupProvider>
    </HotkeysProvider>
  )
}
