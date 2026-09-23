import { useState } from "react"
import { HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import { usePopout } from "@/registry/tradecn/hooks/use-popout"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import { Panel, PanelActions, PanelContent, PanelHeader, PanelPopout, PanelTitle } from "@/registry/tradecn/ui/panel"

const BINDINGS: HotkeyBinding[] = [
  { id: "counter.increment", keys: "i", scope: "panel:counter", description: "Increment counter" },
]

function Counter() {
  const [count, setCount] = useState(0)
  const increment = () => setCount((value) => value + 1)
  useHotkey("counter.increment", increment)
  return (
    <PanelContent className="space-y-3 p-3 text-sm">
      <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted" onClick={increment}>Increment</button>
      <p role="status">Count: {count}</p>
    </PanelContent>
  )
}

function PopoutPanel() {
  const [blocked, setBlocked] = useState(false)
  const popout = usePopout({ title: "Counter", width: 360, height: 240, onBlocked: () => setBlocked(true) })
  return (
    <div className="w-72 max-w-full space-y-2">
      <div className="h-48">
        <PanelPopout popout={popout} placeholder={
          <div className="flex h-full items-center justify-center rounded border border-dashed border-border">
            <button type="button" className="rounded border border-border px-3 py-2 text-sm hover:bg-muted" onClick={popout.close}>Bring counter back</button>
          </div>
        }>
          <Panel kind="counter" className="h-full">
            <PanelHeader>
              <PanelTitle>Counter</PanelTitle>
              <PanelActions>
                <button type="button" className="rounded px-1 hover:bg-muted" onClick={popout.isOpen ? popout.close : () => { setBlocked(false); popout.open() }}>
                  {popout.isOpen ? "Bring back" : "Pop out"}
                </button>
              </PanelActions>
            </PanelHeader>
            <Counter />
          </Panel>
        </PanelPopout>
      </div>
      {blocked && <p role="alert" className="text-sm">Popout blocked. Allow popups and try again.</p>}
    </div>
  )
}

export default function PanelPopoutDemo() {
  return <HotkeysProvider bindings={BINDINGS}><PopoutPanel /></HotkeysProvider>
}
