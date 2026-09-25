import { CommandGroup } from "@/components/ui/command"
import { useState } from "react"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { CommandPalette, CommandPaletteContent, CommandPaletteEmpty, CommandPaletteInput, CommandPaletteItem, CommandPaletteList, useCommandPalette, createActionRegistry, type PaletteAction } from "@/registry/tradecn/ui/command-palette"

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
        <CommandPalette variant="go-bar" actions={actions} goBarGrammar={grammar}>
          <CommandPaletteContent>
            <p className="px-2 pb-2 text-xs font-medium">Instrument functions</p>
            <CommandPaletteInput />
            <CommandPaletteList className="mt-0"><PaletteResults /></CommandPaletteList>
          </CommandPaletteContent>
        </CommandPalette>
        <p role="status">Command: {command}</p>
      </div>
    </HotkeysProvider>
  )
}

function PaletteResults() {
  const { groups } = useCommandPalette()
  return (
    <>
      <CommandPaletteEmpty>Type a symbol and function.</CommandPaletteEmpty>
      {groups.map((group) => (
        <CommandGroup key={group.id} heading={group.heading}>
          {group.rows.map((row) => (
            <CommandPaletteItem key={row.key} row={row} className="items-start py-3">
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{row.title}</span>
                <span className="text-muted-foreground">{row.subtitle}</span>
              </span>
            </CommandPaletteItem>
          ))}
        </CommandGroup>
      ))}
      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">DES: description · GP: price chart</p>
    </>
  )
}
