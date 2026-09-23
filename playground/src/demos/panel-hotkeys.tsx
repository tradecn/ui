import { useState } from "react"
import { HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import { Panel, PanelActions, PanelContent, PanelHeader, PanelTitle } from "@/registry/tradecn/ui/panel"

const BINDINGS: HotkeyBinding[] = [
  { id: "book.refresh", keys: "r", scope: "panel:book", description: "Refresh book" },
]

function BookContent({ title }: { title: string }) {
  const [requests, setRequests] = useState(0)
  const refresh = () => setRequests((count) => count + 1)
  useHotkey("book.refresh", refresh)
  return (
    <>
      <PanelHeader>
        <PanelTitle>{title}</PanelTitle>
        <PanelActions>
          <button type="button" className="rounded px-1 hover:bg-muted" onClick={refresh}>Refresh</button>
        </PanelActions>
      </PanelHeader>
      <PanelContent className="p-3 text-sm">
        <p role="status">Refresh requests: {requests}</p>
      </PanelContent>
    </>
  )
}

export default function PanelHotkeysDemo() {
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <div className="flex w-fit max-w-full flex-wrap justify-center gap-3">
        <Panel kind="book" className="h-36 w-64 max-w-full"><BookContent title="Book A" /></Panel>
        <Panel kind="book" className="h-36 w-64 max-w-full"><BookContent title="Book B" /></Panel>
      </div>
    </HotkeysProvider>
  )
}
