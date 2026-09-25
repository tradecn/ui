import { CommandGroup, CommandShortcut } from "@/components/ui/command"
import { useCallback, useEffect, useState } from "react"
import { HotkeyScope, HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import { CommandPalette, CommandPaletteContent, CommandPaletteDialog, CommandPaletteEmpty, CommandPaletteInput, CommandPaletteItem, CommandPaletteKeys, CommandPaletteList, CommandPaletteResults, CommandPaletteSecondary, useCommandPalette, createActionRegistry, type ActionRegistry } from "@/registry/tradecn/ui/command-palette"

const BINDINGS: HotkeyBinding[] = [
  { id: "book.refresh", keys: "r", scope: "panel:book", description: "Refresh book" },
]

function Book({ actions, onOpen }: { actions: ActionRegistry; onOpen: () => void }) {
  const [requests, setRequests] = useState(0)
  const refresh = useCallback(() => setRequests((count) => count + 1), [])
  useHotkey("book.refresh", refresh)
  useEffect(() => actions.register({
    id: "book.refresh",
    title: "Refresh book",
    scope: "panel:book",
    bindingId: "book.refresh",
    run: refresh,
    secondary: { title: "Reset", run: () => setRequests(0) },
  }), [actions, refresh])
  return (
    <div className="space-y-3 rounded border border-border p-3">
      <p className="font-medium">Order book</p>
      <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted" onClick={onOpen}>Open book commands</button>
      <p role="status">Refresh requests: {requests}</p>
    </div>
  )
}

export default function CommandPaletteScopedActionsDemo() {
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState("No help request.")
  const [actions] = useState(() => {
    const registry = createActionRegistry()
    registry.register({ id: "help", title: "Show help", run: () => setHelp("Help requested.") })
    return registry
  })
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <div className="flex min-h-80 w-sm max-w-full flex-col justify-center gap-3 text-sm lining-nums tabular-nums">
        <button type="button" className="self-start rounded border border-border px-3 py-2 hover:bg-muted" onClick={() => setOpen(true)}>Open global commands</button>
        <HotkeyScope scope="panel:book">
          <Book actions={actions} onOpen={() => setOpen(true)} />
        </HotkeyScope>
        <p role="status">{help}</p>
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
  const { loading } = useCommandPalette()
  return (
    <>
      <CommandPaletteEmpty>{loading ? "Searching…" : "No results"}</CommandPaletteEmpty>
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
