import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/registry/tradecn/ui/panel"

export default function PanelDemo() {
  return (
    <Panel kind="orders" className="h-40 w-72 max-w-full">
      <PanelHeader>
        <PanelTitle>Orders</PanelTitle>
      </PanelHeader>
      <PanelContent className="p-3 text-sm">No open orders.</PanelContent>
    </Panel>
  )
}
