import { useEffect, useState } from "react"
import { CommandPalette, createActionRegistry, type SymbolSearchAdapter } from "@/components/ui/command-palette"
import { HotkeysProvider } from "@/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/lib/hotkeys"

const BINDINGS: HotkeyBinding[] = [{ id: "smoke.ticket", keys: "t", scope: "global", description: "New ticket" }]

const actions = createActionRegistry()

const symbols: SymbolSearchAdapter = {
  debounceMs: 0,
  search: async (query) => (query.toUpperCase().startsWith("ZN") ? [{ symbol: "ZN", name: "10-Year T-Note Futures", exchange: "CBOT", kind: "future" }] : []),
}

// The go-bar is the visible slot. The dialog stays closed until the spec opens it with mod+k.
export function CommandPaletteScene() {
  const [last, setLast] = useState("")
  useEffect(
    () =>
      actions.register([
        { id: "ticket.new", title: "New ticket", bindingId: "smoke.ticket", run: () => setLast("ticket"), secondary: { title: "Sell instead", run: () => setLast("ticket-sell") } },
        { id: "go.blotter", title: "Go to blotter", run: () => setLast("blotter") },
      ]),
    [],
  )
  const shared = { actions, symbols, onSymbolSelect: (s: { symbol: string }) => setLast(`symbol:${s.symbol}`) }
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <CommandPalette variant="go-bar" {...shared} />
      <CommandPalette {...shared} />
      <output data-palette-last={last} />
    </HotkeysProvider>
  )
}
