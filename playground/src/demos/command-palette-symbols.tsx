import { useState } from "react"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { CommandPalette, createActionRegistry, type SymbolResult, type SymbolSearchAdapter } from "@/registry/tradecn/ui/command-palette"

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
          labels={{ title: "Find a symbol", placeholder: "Search at least two letters…", empty: "No matching symbols" }}
        />
      </div>
    </HotkeysProvider>
  )
}
