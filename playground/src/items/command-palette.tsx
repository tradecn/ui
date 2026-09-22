import { useCallback, useEffect, useState } from "react"
import { HotkeyScope, HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import { CommandPalette, createActionRegistry, type PaletteAction, type PaletteRecent, type SymbolResult, type SymbolSearchAdapter } from "@/registry/tradecn/ui/command-palette"

const BINDINGS: HotkeyBinding[] = [
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter", group: "Go" },
  { id: "go.watchlist", keys: "g w", scope: "global", description: "Go to the watchlist", group: "Go" },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order", group: "Order book" },
]

const UNIVERSE: SymbolResult[] = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ", kind: "equity" },
  { symbol: "AMZN", name: "Amazon.com Inc", exchange: "NASDAQ", kind: "equity" },
  { symbol: "MSFT", name: "Microsoft Corp", exchange: "NASDAQ", kind: "equity" },
  { symbol: "NVDA", name: "NVIDIA Corp", exchange: "NASDAQ", kind: "equity" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "ARCA", kind: "etf" },
  { symbol: "TLT", name: "iShares 20+ Year Treasury Bond ETF", exchange: "NASDAQ", kind: "etf" },
  { symbol: "ZN", name: "10-Year T-Note Futures", exchange: "CBOT", kind: "future" },
  { symbol: "ZB", name: "U.S. Treasury Bond Futures", exchange: "CBOT", kind: "future" },
  { symbol: "EURUSD", name: "Euro / U.S. Dollar", kind: "fx" },
  { symbol: "USDJPY", name: "U.S. Dollar / Japanese Yen", kind: "fx" },
]

// What a real adapter looks like: a request that takes a while and gives up when told to.
const symbols: SymbolSearchAdapter = {
  minLength: 1,
  debounceMs: 120,
  search: (query, signal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const q = query.toLowerCase()
        resolve(UNIVERSE.filter((s) => s.symbol.toLowerCase().startsWith(q) || s.name?.toLowerCase().includes(q)).slice(0, 6))
      }, 180)
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
  { code: "FA", title: "Financials" },
  { code: "TKT", title: "New ticket" },
]

const RECENTS_KEY = "tradecn.playground.palette.recents"

// The consumer owns persistence here too: load the recents once, save them on change.
const actions = createActionRegistry()
try {
  actions.loadRecents(JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as PaletteRecent[])
} catch {
  // a bad blob is not worth a crash
}
actions.onRecentsChange((recents) => localStorage.setItem(RECENTS_KEY, JSON.stringify(recents)))

function Book({ log }: { log: (line: string) => void }) {
  useHotkey("book.cancel", () => log("book: cancelled the selected order"))
  return (
    <HotkeyScope scope="panel:book" className="rounded border border-border p-3 outline-none focus-within:border-ring">
      <h2 className="mb-1 font-semibold">Order book</h2>
      <p className="text-muted-foreground">Click here, then open the palette: "Cancel selected order" is on offer only from inside this panel.</p>
    </HotkeyScope>
  )
}

function Scene() {
  const [lines, setLines] = useState<string[]>([])
  const [watchlist, setWatchlist] = useState<string[]>(["ZN"])
  const [open, setOpen] = useState(false)
  const log = useCallback((line: string) => setLines((l) => [line, ...l].slice(0, 8)), [])
  useHotkey("go.blotter", () => log("go: blotter"))
  useHotkey("go.watchlist", () => log("go: watchlist"))

  useEffect(() => {
    const list: PaletteAction[] = [
      { id: "go.blotter", title: "Go to blotter", group: "Go", keywords: ["orders", "fills"], bindingId: "go.blotter", run: () => log("go: blotter") },
      { id: "go.watchlist", title: "Go to watchlist", group: "Go", bindingId: "go.watchlist", run: () => log("go: watchlist") },
      { id: "ticket.buy", title: "New buy ticket", group: "Trade", keywords: ["order"], run: () => log("ticket: buy"), secondary: { title: "Sell instead", run: () => log("ticket: sell") } },
      { id: "book.cancel", title: "Cancel selected order", group: "Trade", scope: "panel:book", bindingId: "book.cancel", run: () => log("book: cancelled the selected order") },
      { id: "view.theme", title: "Toggle theme", group: "View", keywords: ["dark", "light"], run: () => document.documentElement.classList.toggle("dark") },
    ]
    return actions.register(list)
  }, [log])

  const grammar = (input: string): PaletteAction[] => {
    const [symbol, fn = ""] = input.toUpperCase().split(/\s+/)
    if (!symbol || !UNIVERSE.some((s) => s.symbol === symbol)) return []
    return FUNCTIONS.filter((f) => f.code.startsWith(fn)).map((f) => ({ id: `${symbol}.${f.code}`, title: `${symbol} ${f.code}`, subtitle: f.title, run: () => log(`run: ${symbol} ${f.code}`) }))
  }

  const shared = {
    actions,
    symbols,
    goBarGrammar: grammar,
    onSymbolSelect: (s: SymbolResult) => log(`load: ${s.symbol}`),
    symbolSecondary: {
      title: "Load and watch",
      run: (s: SymbolResult) => {
        log(`load: ${s.symbol}, added to the watchlist`)
        setWatchlist((w) => (w.includes(s.symbol) ? w : [...w, s.symbol]))
      },
    },
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6 font-(family-name:--tradecn-font-mono) text-xs">
      <h1 className="text-sm font-semibold">command-palette</h1>
      <p className="text-muted-foreground">
        The go-bar below and the dialog share one registry, one symbol adapter, and one list of recents. Try <code>aapl gp</code>, <code>tick</code>, or a symbol, then Shift+Enter. The dialog opens on mod+k; the go-bar focuses on <code>/</code>.
      </p>
      <CommandPalette variant="go-bar" {...shared} />
      <CommandPalette {...shared} open={open} onOpenChange={setOpen} className="sm:max-w-xl" />
      <div className="grid grid-cols-2 gap-3">
        <Book log={log} />
        <section className="rounded border border-border p-3">
          <h2 className="mb-1 font-semibold">Watchlist</h2>
          <p>{watchlist.join(" ")}</p>
        </section>
      </div>
      <button className="rounded border border-border px-2 py-1" onClick={() => setOpen(true)}>
        open the palette
      </button>
      <ol className="text-muted-foreground">
        {lines.map((line, i) => (
          <li key={lines.length - i}>{line}</li>
        ))}
      </ol>
    </main>
  )
}

export function CommandPaletteScene() {
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <Scene />
    </HotkeysProvider>
  )
}
