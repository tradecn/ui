import { CommandGroup } from "@/components/ui/command"
import { useState } from "react"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { CommandPalette, CommandPaletteContent, CommandPaletteDialog, CommandPaletteEmpty, CommandPaletteInput, CommandPaletteItem, CommandPaletteList, CommandPaletteResults, createActionRegistry } from "@/registry/tradecn/ui/command-palette"

export default function CommandPaletteSharedRecentsDemo() {
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
      <div className="min-h-80 w-md max-w-full space-y-3 text-sm">
        <CommandPalette variant="go-bar" actions={actions}>
          <CommandPaletteContent>
            <CommandPaletteInput />
            <CommandPaletteList><PaletteResults /></CommandPaletteList>
          </CommandPaletteContent>
        </CommandPalette>
        <button type="button" className="rounded border border-border px-3 py-2 hover:bg-muted" onClick={() => setOpen(true)}>Open dialog</button>
        <p role="status">Selected: {selected}</p>
        <CommandPalette actions={actions} open={open} onOpenChange={setOpen}>
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
  return (
    <>
      <CommandPaletteEmpty>No results</CommandPaletteEmpty>
      <CommandPaletteResults>
        {(group) => (
          <CommandGroup heading={group.heading}>
            {(group.id === "recent" ? group.rows.slice(0, 5) : group.rows).map((row) => (
              <CommandPaletteItem key={row.key} row={row}>
                <span className="truncate">{row.title}</span>

              </CommandPaletteItem>
            ))}
          </CommandGroup>
        )}
      </CommandPaletteResults>
    </>
  )
}
