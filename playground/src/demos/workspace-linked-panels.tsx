import { LinkGroupProvider, useLinkGroup } from "@/registry/tradecn/hooks/use-link-group"
import type { LinkGroup } from "@/registry/tradecn/lib/link-group"
import { LinkGroupDot, PanelContent, PanelHeader, SymbolTag } from "@/registry/tradecn/ui/panel"
import { Workspace, useWorkspacePanel } from "@/registry/tradecn/ui/workspace"

const SYMBOLS = new Set(["ZN", "ZB", "ES"])

function Instrument() {
  const panel = useWorkspacePanel()
  const link = useLinkGroup({
    source: panel.id,
    defaultGroup: (panel.state.group as LinkGroup | undefined) ?? null,
    defaultSymbol: (panel.state.symbol as string | undefined) ?? "ZN",
    onGroupChange: (group) => panel.setState({ group }),
    onSymbolChange: (symbol) => panel.setState({ symbol }),
  })
  return (
    <>
      <PanelHeader>
        <SymbolTag value={link.symbol} onCommit={link.setSymbol} validate={(symbol) => SYMBOLS.has(symbol)} />
        <LinkGroupDot group={link.group} onGroupChange={link.setGroup} />
      </PanelHeader>
      <PanelContent className="p-3">Following {link.symbol}.</PanelContent>
    </>
  )
}

const PANELS = { instrument: Instrument }

export default function WorkspaceLinkedPanelsDemo() {
  return (
    <LinkGroupProvider transport={null}>
      <Workspace
        className="h-64 rounded-md border border-border"
        panels={PANELS}
        seed={(api) => {
          const first = api.addPanel({ kind: "instrument", title: "Book", state: { symbol: "ZN", group: 1 } })
          api.addPanel({ kind: "instrument", title: "Trades", state: { symbol: "ZN", group: 1 }, position: { reference: first, direction: "right" } })
        }}
        watermark="No panels."
      />
    </LinkGroupProvider>
  )
}
