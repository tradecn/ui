import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { HotkeyScope, HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import { CommandPalette, createActionRegistry, type PaletteAction, type SymbolResult, type SymbolSearchAdapter } from "@/registry/tradecn/ui/command-palette"

const BINDINGS: HotkeyBinding[] = [
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter", group: "Go" },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order", group: "Order book" },
]

const UNIVERSE: SymbolResult[] = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ", kind: "equity" },
  { symbol: "MSFT", name: "Microsoft Corp", exchange: "NASDAQ", kind: "equity" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "ARCA", kind: "etf" },
  { symbol: "TLT", name: "iShares 20+ Year Treasury Bond ETF", exchange: "NASDAQ", kind: "etf" },
  { symbol: "ZN", name: "10-Year T-Note Futures", exchange: "CBOT", kind: "future" },
  { symbol: "EURUSD", name: "Euro / U.S. Dollar", kind: "fx" },
]

// What a real adapter looks like: a request that takes a while and gives up when told to.
const symbols: SymbolSearchAdapter = {
  minLength: 1,
  debounceMs: 120,
  search: (query, signal) =>
    new Promise((resolve, reject) => {
      const q = query.toLowerCase()
      const timer = setTimeout(() => resolve(UNIVERSE.filter((s) => s.symbol.toLowerCase().startsWith(q) || s.name?.toLowerCase().includes(q)).slice(0, 6)), 180)
      signal.addEventListener("abort", () => {
        clearTimeout(timer)
        reject(new DOMException("aborted", "AbortError"))
      })
    }),
}

const FUNCTIONS = [
  { code: "DES", title: "Description" },
  { code: "GP", title: "Price chart" },
  { code: "N", title: "News" },
]

const actions = createActionRegistry()

function Book({ log }: { log: (line: string) => void }) {
  useHotkey("book.cancel", () => log("book: cancelled the selected order"))
  return (
    <HotkeyScope scope="panel:book" className="rounded border border-border p-3 outline-none focus-within:border-ring">
      <h2 className="mb-1 font-semibold">Order book</h2>
      <p className="text-muted-foreground">Click here, then open the palette: "Cancel selected order" is on offer only from inside this panel.</p>
    </HotkeyScope>
  )
}

function Demo() {
  const [lines, setLines] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const log = useCallback((line: string) => setLines((l) => [line, ...l].slice(0, 4)), [])
  useHotkey("go.blotter", () => log("go: blotter"))

  // A panel registers its actions on mount and takes them back on unmount.
  useEffect(() => {
    const list: PaletteAction[] = [
      { id: "go.blotter", title: "Go to blotter", group: "Go", keywords: ["orders", "fills"], bindingId: "go.blotter", run: () => log("go: blotter") },
      { id: "ticket.buy", title: "New buy ticket", group: "Trade", keywords: ["order"], run: () => log("ticket: buy"), secondary: { title: "Sell instead", run: () => log("ticket: sell") } },
      { id: "book.cancel", title: "Cancel selected order", group: "Trade", scope: "panel:book", bindingId: "book.cancel", run: () => log("book: cancelled the selected order") },
    ]
    return actions.register(list)
  }, [log])

  // "aapl gp": a symbol, then a function code.
  const grammar = (input: string): PaletteAction[] => {
    const [symbol, fn = ""] = input.toUpperCase().split(/\s+/)
    if (!symbol || !UNIVERSE.some((s) => s.symbol === symbol)) return []
    return FUNCTIONS.filter((f) => f.code.startsWith(fn)).map((f) => ({ id: `${symbol}.${f.code}`, title: `${symbol} ${f.code}`, subtitle: f.title, run: () => log(`run: ${symbol} ${f.code}`) }))
  }

  const shared = { actions, symbols, goBarGrammar: grammar, onSymbolSelect: (s: SymbolResult) => log(`load: ${s.symbol}`) }

  return (
    <div className="min-h-[26rem] space-y-3 font-(family-name:--tradecn-font-mono) text-xs">
      <p className="text-muted-foreground">
        The go-bar and the dialog share one registry, one symbol adapter, and one list of recents. Try <code>aapl gp</code>, <code>tick</code>, or a symbol. The dialog opens on mod+k; the go-bar focuses on <code>/</code>.
      </p>
      <CommandPalette variant="go-bar" {...shared} />
      <CommandPalette {...shared} open={open} onOpenChange={setOpen} className="sm:max-w-xl" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Book log={log} />
        <ol className="text-muted-foreground">
          {lines.map((line, i) => (
            <li key={lines.length - i}>{line}</li>
          ))}
        </ol>
      </div>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Open the palette
      </Button>
    </div>
  )
}

export default function CommandPaletteDemo() {
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <Demo />
    </HotkeysProvider>
  )
}
