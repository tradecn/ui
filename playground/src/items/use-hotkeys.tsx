import { useEffect, useState } from "react"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { HotkeyScope, HotkeysProvider, useHotkey, useHotkeyList, useHotkeys, usePendingChord } from "@/registry/tradecn/hooks/use-hotkeys"
import { createHotkeyRegistry, formatKeys, keysFromEvent, type HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"

const BINDINGS: HotkeyBinding[] = [
  { id: "app.help", keys: "?", scope: "global", description: "Say hello", group: "App" },
  { id: "app.search", keys: "mod+k", scope: "editing", description: "Search (runs while typing too)", group: "App" },
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter", group: "Go" },
  { id: "go.watchlist", keys: "g w", scope: "global", description: "Go to the watchlist", group: "Go" },
  { id: "book.next", keys: "j", scope: "panel:book", description: "Next order (repeats while held)", group: "Order book", repeat: true },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order", group: "Order book" },
]

const STORAGE_KEY = "tradecn.playground.hotkeys"

// The consumer owns persistence: load once, save on change.
const registry = createHotkeyRegistry()
try {
  registry.load(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"))
} catch {
  // a bad blob is not worth a crash
}
registry.onChange((overrides) => localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides)))

function Keys({ keys }: { keys: string }) {
  if (!keys) return <span className="text-muted-foreground">unbound</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      {formatKeys(keys).map((caps, i) => (
        <KbdGroup key={i}>
          {caps.map((cap) => (
            <Kbd key={cap}>{cap}</Kbd>
          ))}
        </KbdGroup>
      ))}
    </span>
  )
}

function Book({ name, log }: { name: string; log: (line: string) => void }) {
  const [selected, setSelected] = useState(0)
  const [orders, setOrders] = useState(["BUY 5mm 99-16+", "SELL 2mm 99-17", "BUY 10mm 99-15+", "SELL 1mm 99-18"])
  useHotkey("book.next", () => setSelected((i) => (orders.length ? (i + 1) % orders.length : 0)))
  useHotkey("book.cancel", () => {
    const order = orders[selected]
    if (!order) return
    log(`${name}: cancelled ${order}`)
    setOrders((list) => list.filter((_, i) => i !== selected))
    setSelected((i) => Math.max(0, Math.min(i, orders.length - 2)))
  })
  return (
    <HotkeyScope scope="panel:book" className="rounded border border-border p-3 outline-none focus-within:border-ring">
      <h2 className="mb-2 font-semibold">{name}</h2>
      <ul>
        {orders.map((order, i) => (
          <li key={order} className={i === selected ? "bg-muted px-1" : "px-1"}>
            {order}
          </li>
        ))}
        {!orders.length && <li className="text-muted-foreground">empty</li>}
      </ul>
    </HotkeyScope>
  )
}

function Bindings() {
  const hotkeys = useHotkeys()
  const list = useHotkeyList()
  const [capturing, setCapturing] = useState<string | null>(null)
  // The list changes whenever a binding does, so this is always current.
  const conflicts = hotkeys.conflicts()
  useEffect(() => {
    if (!capturing) return
    // Ahead of the registry's listener, so the key being captured does not also fire.
    const onKey = (event: KeyboardEvent) => {
      const keys = keysFromEvent(event)
      if (!keys) return
      event.preventDefault()
      event.stopPropagation()
      if (keys !== "escape") hotkeys.remap(capturing, keys)
      setCapturing(null)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [capturing, hotkeys])
  return (
    <section>
      <table className="w-full">
        <tbody>
          {list.map((entry) => (
            <tr key={entry.id} className="border-b border-border">
              <td className="py-1 pr-3 text-muted-foreground">{entry.group}</td>
              <td className="py-1 pr-3">{entry.description}</td>
              <td className="py-1 pr-3 text-muted-foreground">{entry.scope}</td>
              <td className="py-1 pr-3">{capturing === entry.id ? <span className="text-muted-foreground">press a key, Esc to keep</span> : <Keys keys={entry.keys} />}</td>
              <td className="py-1 text-right">
                <button className="rounded border border-border px-2" onClick={() => setCapturing(entry.id)}>
                  remap
                </button>
                {entry.remapped && (
                  <button className="ml-1 rounded border border-border px-2" onClick={() => hotkeys.reset(entry.id)}>
                    reset
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {conflicts.length > 0 && (
        <ul className="mt-2 text-destructive">
          {conflicts.map((c) => (
            <li key={c.ids.join()}>
              {c.kind}: {c.ids.join(" and ")} on {c.keys}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Scene() {
  const [lines, setLines] = useState<string[]>([])
  const log = (line: string) => setLines((l) => [line, ...l].slice(0, 6))
  const pending = usePendingChord()
  useHotkey("app.help", () => log("hello"))
  useHotkey("app.search", () => log("search"))
  useHotkey("go.blotter", () => log("go: blotter"))
  useHotkey("go.watchlist", () => log("go: watchlist"))
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6 font-(family-name:--tradecn-font-mono) text-xs">
      <h1 className="text-sm font-semibold">use-hotkeys</h1>
      <p className="text-muted-foreground">Click a book, then j and x act on that book only. Type in the field: single keys are yours, the search key still runs. Remaps persist in localStorage.</p>
      <div className="grid grid-cols-2 gap-3">
        <Book name="Book A" log={log} />
        <Book name="Book B" log={log} />
      </div>
      <input className="w-full rounded border border-border bg-transparent px-2 py-1" placeholder="type x, j, g, ? here" />
      <div className="flex h-5 items-center gap-2 text-muted-foreground">{pending ? <><Keys keys={pending} /> …</> : "no chord in flight"}</div>
      <Bindings />
      <ol className="text-muted-foreground">
        {lines.map((line, i) => (
          <li key={lines.length - i}>{line}</li>
        ))}
      </ol>
    </main>
  )
}

export function UseHotkeysScene() {
  return (
    <HotkeysProvider registry={registry} bindings={BINDINGS}>
      <Scene />
    </HotkeysProvider>
  )
}
