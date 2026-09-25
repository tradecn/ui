import { CommandGroup, CommandShortcut } from "@/components/ui/command"
import { useState } from "react"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { CommandPalette, CommandPaletteContent, CommandPaletteDialog, CommandPaletteEmpty, CommandPaletteInput, CommandPaletteItem, CommandPaletteKeys, CommandPaletteList, CommandPaletteResults, CommandPaletteSecondary, useCommandPalette, createActionRegistry, type SymbolResult, type SymbolSearchAdapter } from "@/registry/tradecn/ui/command-palette"

const SYMBOLS: SymbolResult[] = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "ZN", name: "T-Note" },
]

const symbols: SymbolSearchAdapter = {
  minLength: 2,
  debounceMs: 150,
  search: (query, signal) => new Promise((resolve, reject) => {
    signal.throwIfAborted()
    // A delayed local lookup stands in for a request to your symbol service.
    const timer = setTimeout(() => {
      const q = query.toLowerCase()
      resolve(SYMBOLS.filter((item) => item.symbol.toLowerCase().startsWith(q) || item.name?.toLowerCase().includes(q)))
    }, 350)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    }, { once: true })
  }),
}

export default function CommandPaletteSymbolsDemo() {
  const [actions] = useState(() => createActionRegistry())
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState("No symbol selected.")
  return (
    <HotkeysProvider>
      <div className="flex min-h-80 w-fit max-w-full flex-col justify-center gap-3 text-sm">
        <button type="button" className="self-start rounded border border-border px-3 py-2 hover:bg-muted" onClick={() => setOpen(true)}>Find a symbol</button>
        <p role="status">{result}</p>
        <CommandPalette
          actions={actions}
          open={open}
          onOpenChange={setOpen}
          symbols={symbols}
          onSymbolSelect={(symbol) => setResult(`Selected: ${symbol.symbol}`)}
          symbolSecondary={{ title: "Watch", run: (symbol) => setResult(`Watch requested: ${symbol.symbol}`) }}
          labels={{ title: "Find a symbol", placeholder: "Search at least two letters…" }}
        >
          <CommandPaletteDialog>
            <CommandPaletteContent>
              <CommandPaletteInput />
              <CommandPaletteList><PaletteResults /></CommandPaletteList>
            </CommandPaletteContent>
          </CommandPaletteDialog>
        </CommandPalette>
      </div>
    </HotkeysProvider>
  )
}

function PaletteResults() {
  const { loading } = useCommandPalette()
  return (
    <>
      <CommandPaletteEmpty>{loading ? "Searching…" : "No matching symbols"}</CommandPaletteEmpty>
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
