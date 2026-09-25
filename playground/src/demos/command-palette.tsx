import { CommandGroup } from "@/components/ui/command"
import { useState } from "react"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import {
  CommandPalette,
  CommandPaletteContent,
  CommandPaletteDialog,
  CommandPaletteEmpty,
  CommandPaletteInput,
  CommandPaletteItem,
  CommandPaletteList,
  CommandPaletteResults,
  createActionRegistry,
} from "@/registry/tradecn/ui/command-palette"

export default function CommandPaletteDemo() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState("None")
  const [actions] = useState(() => {
    const registry = createActionRegistry()
    registry.register([
      { id: "orders", title: "Show orders", run: () => setSelected("Show orders") },
      { id: "positions", title: "Show positions", run: () => setSelected("Show positions") },
    ])
    return registry
  })
  return (
    <HotkeysProvider>
      <div className="flex min-h-80 w-fit max-w-full flex-col justify-center gap-3 text-sm">
        <button type="button" className="self-start rounded border border-border px-3 py-2 hover:bg-muted" onClick={() => setOpen(true)}>Open commands</button>
        <p role="status">Selected: {selected}</p>
        <CommandPalette actions={actions} open={open} onOpenChange={setOpen}>
          <CommandPaletteDialog>
            <CommandPaletteContent>
              <CommandPaletteInput />
              <CommandPaletteList>
                <CommandPaletteEmpty>No results</CommandPaletteEmpty>
                <CommandPaletteResults>
                  {(group) => (
                    <CommandGroup heading={group.heading}>
                      {(group.id === "recent" ? group.rows.slice(0, 5) : group.rows).map((row) => (
                        <CommandPaletteItem key={row.key} row={row}>{row.title}</CommandPaletteItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandPaletteResults>
              </CommandPaletteList>
            </CommandPaletteContent>
          </CommandPaletteDialog>
        </CommandPalette>
      </div>
    </HotkeysProvider>
  )
}
