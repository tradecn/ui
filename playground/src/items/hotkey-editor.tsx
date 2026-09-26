import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { HotkeysProvider, useHotkey } from "@/registry/tradecn/hooks/use-hotkeys"
import { createHotkeyRegistry, type HotkeyBinding, type HotkeyOverrides } from "@/registry/tradecn/lib/hotkeys"
import { HotkeyEditor } from "@/registry/tradecn/ui/hotkey-editor"
import { HotkeyEditorGroups } from "@/demos/hotkey-editor-groups"

// A registry with the bindings an app might declare, an editor over it, and beside it what the app
// would persist: the override map the registry hands to onChange. Press keys on the page to see the
// bindings fire, then change one and press again.

const BINDINGS: HotkeyBinding[] = [
  { id: "palette.open", keys: "mod+k", scope: "editing", description: "Open the command palette", group: "General" },
  { id: "help.keys", keys: "?", scope: "global", description: "Show these shortcuts", group: "General" },
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter", group: "Go" },
  { id: "go.inquiries", keys: "g i", scope: "global", description: "Go to the inquiries", group: "Go" },
  { id: "go.book", keys: "g o", scope: "global", description: "Go to the book", group: "Go" },
  { id: "rfq.send", keys: "mod+enter", scope: "editing", description: "Send the quote", group: "Inquiry" },
  { id: "rfq.pass", keys: "mod+shift+p", scope: "editing", description: "Pass the inquiry", group: "Inquiry" },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order" },
  { id: "book.flatten", keys: "shift+x", scope: "panel:book", description: "Flatten the position" },
]

function Fired({ onFire }: { onFire: (id: string) => void }) {
  for (const binding of BINDINGS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkey(binding.id, () => onFire(binding.id))
  }
  return null
}

export function HotkeyEditorScene() {
  const [registry] = useState(() => createHotkeyRegistry())
  const [overrides, setOverrides] = useState<HotkeyOverrides>({})
  const [fired, setFired] = useState<string[]>([])
  const [imported, setImported] = useState(0)
  return (
    <HotkeysProvider registry={registry} bindings={BINDINGS}>
      <main className="mx-auto max-w-4xl space-y-4 p-6 font-(family-name:--tradecn-font-mono) text-xs">
        <h1 className="text-sm font-semibold">hotkey-editor</h1>
        <p className="text-muted-foreground">
          Every binding the registry holds, grouped, with its keys in force. Change one by pressing the new shortcut, type a chord as text, or reset it. Conflicts are said under the rows they touch. What the app would save is on the right, straight from the registry's <code>onChange</code>. Press a shortcut anywhere on the page and it
          fires below.
        </p>
        <div className="grid min-w-0 md:grid-cols-[minmax(0,1fr)_16rem] gap-6">
          <HotkeyEditor>
            <HotkeyEditorGroups>
              <Button type="button" size="sm" variant="outline" onClick={() => setOverrides(registry.overrides())}>Export</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => {
                registry.load({ "go.blotter": "g l", "book.cancel": "backspace" })
                setOverrides(registry.overrides())
                setImported((n) => n + 1)
              }}>Import</Button>
            </HotkeyEditorGroups>
          </HotkeyEditor>
          <div className="space-y-2">
            <p className="text-muted-foreground">what the app persists</p>
            <pre className="rounded-md border border-border bg-card p-2 text-xs" data-hotkey-overrides>
              {JSON.stringify(overrides, null, 2)}
            </pre>
            <p className="text-muted-foreground">fired</p>
            <p className="min-h-4" data-hotkey-fired>
              {fired.slice(-5).join(" · ") || " "}
            </p>
            {imported > 0 && <p className="text-muted-foreground">imported {imported}×</p>}
            <Button size="sm" variant="outline" onClick={() => setFired([])}>
              Clear
            </Button>
          </div>
        </div>
        <Persist registry={registry} onChange={setOverrides} />
        <Fired onFire={(id) => setFired((f) => [...f, id])} />
      </main>
    </HotkeysProvider>
  )
}

// The registry tells the app after a remap or a reset; the app writes the map wherever it keeps settings.
function Persist({ registry, onChange }: { registry: ReturnType<typeof createHotkeyRegistry>; onChange: (o: HotkeyOverrides) => void }) {
  useEffect(() => registry.onChange(onChange), [registry, onChange])
  return null
}
