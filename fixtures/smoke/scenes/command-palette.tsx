import { CommandGroup, CommandShortcut } from "@/components/ui/command"
import { useEffect, useState } from "react"
import { CommandPalette, CommandPaletteContent, CommandPaletteDialog, CommandPaletteEmpty, CommandPaletteInput, CommandPaletteItem, CommandPaletteKeys, CommandPaletteList, CommandPaletteResults, CommandPaletteSecondary, useCommandPalette, createActionRegistry, type SymbolSearchAdapter } from "@/components/ui/command-palette"
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
      <CommandPalette variant="go-bar" {...shared}>
        <CommandPaletteContent>
          <CommandPaletteInput />
          <CommandPaletteList><PaletteResults /></CommandPaletteList>
        </CommandPaletteContent>
      </CommandPalette>
      <CommandPalette {...shared}>
        <CommandPaletteDialog>
          <CommandPaletteContent>
            <CommandPaletteInput />
            <CommandPaletteList><PaletteResults /></CommandPaletteList>
            <button type="button" onClick={() => setLast("help")}>Palette help</button>
          </CommandPaletteContent>
        </CommandPaletteDialog>
      </CommandPalette>
      <output data-palette-last={last} />
    </HotkeysProvider>
  )
}

function PaletteResults() {
  const { loading } = useCommandPalette()
  return (
    <>
      <CommandPaletteEmpty>{loading ? "Searching…" : "No results"}</CommandPaletteEmpty>
      <CommandPaletteResults>
        {(group) => (
          <CommandGroup heading={group.heading}>
            {(group.id === "recent" ? group.rows.slice(0, 5) : group.rows).map((row) => (
              <CommandPaletteItem key={row.key} row={row}>
                <span className="truncate">{row.title}</span>
                {row.subtitle && <span className="truncate text-muted-foreground">{row.subtitle}</span>}
                {row.badge && <span className="rounded border border-border px-1 text-xs uppercase">{row.badge}</span>}
                {(row.secondary || row.keys) && (
                  <CommandShortcut className="flex shrink-0 items-center gap-2 text-xs tracking-normal">
                    <CommandPaletteSecondary><CommandPaletteKeys keys="shift+enter" />{row.secondary?.title}</CommandPaletteSecondary>
                    {row.keys && <CommandPaletteKeys keys={row.keys} />}
                  </CommandShortcut>
                )}
              </CommandPaletteItem>
            ))}
          </CommandGroup>
        )}
      </CommandPaletteResults>
    </>
  )
}
