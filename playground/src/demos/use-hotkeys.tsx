import { useState } from "react"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { HotkeyScope, HotkeysProvider, useHotkey, useHotkeyList, usePendingChord } from "@/registry/tradecn/hooks/use-hotkeys"
import { formatKeys, type HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"

// Declared once, by id. What a key does is bound where it is used.
const BINDINGS: HotkeyBinding[] = [
  { id: "app.help", keys: "?", scope: "global", description: "Say hello", group: "App" },
  { id: "app.search", keys: "mod+k", scope: "editing", description: "Search, even while typing", group: "App" },
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter", group: "Go" },
  { id: "book.next", keys: "j", scope: "panel:book", description: "Next order", group: "Order book", repeat: true },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order", group: "Order book" },
]

function Keys({ keys }: { keys: string }) {
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

// Two books share one declaration of j and x. Each binding is fenced to the scope it is called inside.
function Book({ name, log }: { name: string; log: (line: string) => void }) {
  const [selected, setSelected] = useState(0)
  const [orders, setOrders] = useState(["BUY 5mm 99-16+", "SELL 2mm 99-17", "BUY 10mm 99-15+"])
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

function Demo() {
  const [lines, setLines] = useState<string[]>([])
  const log = (line: string) => setLines((l) => [line, ...l].slice(0, 4))
  const pending = usePendingChord()
  const list = useHotkeyList()
  useHotkey("app.help", () => log("hello"))
  useHotkey("app.search", () => log("search"))
  useHotkey("go.blotter", () => log("go: blotter"))
  return (
    <div className="space-y-3 font-mono text-xs">
      <p className="text-muted-foreground">Click a book, then j and x act on that book only. In the field, single keys are yours and the search key still runs.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Book name="Book A" log={log} />
        <Book name="Book B" log={log} />
      </div>
      <input className="w-full rounded border border-border bg-transparent px-2 py-1" placeholder="type x, j, g, or ? here" />
      <table className="w-full">
        <tbody>
          {list.map((entry) => (
            <tr key={entry.id} className="border-b border-border">
              <td className="py-1 pr-3 text-muted-foreground">{entry.group}</td>
              <td className="py-1 pr-3">{entry.description}</td>
              <td className="py-1 text-right">
                <Keys keys={entry.keys} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex h-5 items-center gap-2 text-muted-foreground">{pending ? <Keys keys={pending} /> : lines[0] ?? "nothing pressed yet"}</div>
    </div>
  )
}

export default function UseHotkeysDemo() {
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <Demo />
    </HotkeysProvider>
  )
}
