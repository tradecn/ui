import { LinkGroupProvider, useLinkGroup } from "@/registry/tradecn/hooks/use-link-group"
import type { LinkGroup } from "@/registry/tradecn/lib/link-group"
import { LinkGroupDot, Panel, PanelContent, PanelHeader, PanelTitle, SymbolTag } from "@/registry/tradecn/ui/panel"

const SYMBOLS = new Set(["ZN", "ZB", "ES"])

function Book({ title, group, symbol }: { title: string; group: LinkGroup; symbol: string }) {
  const link = useLinkGroup({ source: title, defaultGroup: group, defaultSymbol: symbol })
  return (
    <Panel kind="book" className="h-36 w-56 max-w-full">
      <PanelHeader>
        <PanelTitle>{title}</PanelTitle>
        <SymbolTag value={link.symbol} onCommit={link.setSymbol} validate={(value) => SYMBOLS.has(value)} />
        <LinkGroupDot group={link.group} onGroupChange={link.setGroup} />
      </PanelHeader>
      <PanelContent className="p-3 text-sm">Following {link.symbol}.</PanelContent>
    </Panel>
  )
}

export default function PanelLinkedDemo() {
  return (
    <LinkGroupProvider transport={null}>
      <div className="flex w-fit max-w-full flex-wrap justify-center gap-3">
        <Book title="Book A" group={1} symbol="ZN" />
        <Book title="Book B" group={1} symbol="ZN" />
        <Book title="Book C" group={null} symbol="ES" />
      </div>
    </LinkGroupProvider>
  )
}
