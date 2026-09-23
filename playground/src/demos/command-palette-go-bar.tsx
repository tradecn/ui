import { useState } from "react"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { CommandPalette, createActionRegistry, type PaletteAction } from "@/registry/tradecn/ui/command-palette"

const SYMBOLS = new Set(["AAPL", "MSFT", "ZN"])
const FUNCTIONS = [
  { code: "DES", title: "Description" },
  { code: "GP", title: "Price chart" },
]

export default function CommandPaletteGoBarDemo() {
  const [actions] = useState(() => createActionRegistry())
  const [command, setCommand] = useState("None")
  const grammar = (input: string): PaletteAction[] => {
    const [symbol, code = ""] = input.toUpperCase().split(/\s+/)
    if (!symbol || !SYMBOLS.has(symbol)) return []
    return FUNCTIONS.filter((fn) => fn.code.startsWith(code)).map((fn) => ({
      id: `${symbol}.${fn.code}`,
      title: `${symbol} ${fn.code}`,
      subtitle: fn.title,
      run: () => setCommand(`${symbol} ${fn.code}`),
    }))
  }
  return (
    <HotkeysProvider>
      <div className="min-h-64 w-md max-w-full space-y-3 text-sm">
        <CommandPalette variant="go-bar" actions={actions} goBarGrammar={grammar} />
        <p role="status">Command: {command}</p>
      </div>
    </HotkeysProvider>
  )
}
