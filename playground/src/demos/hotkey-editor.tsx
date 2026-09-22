import { useEffect, useState } from "react"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { createHotkeyRegistry, type HotkeyBinding, type HotkeyOverrides } from "@/registry/tradecn/lib/hotkeys"
import { HotkeyEditor } from "@/registry/tradecn/ui/hotkey-editor"

// The bindings an app declares, the editor over them, and what the app would persist: the override
// map the registry hands to onChange after a remap or a reset.
const BINDINGS: HotkeyBinding[] = [
  { id: "palette.open", keys: "mod+k", scope: "editing", description: "Open the command palette", group: "General" },
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter", group: "Go" },
  { id: "go.inquiries", keys: "g i", scope: "global", description: "Go to the inquiries", group: "Go" },
  { id: "rfq.send", keys: "mod+enter", scope: "editing", description: "Send the quote", group: "Inquiry" },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order" },
]

export default function HotkeyEditorDemo() {
  const [registry] = useState(() => createHotkeyRegistry())
  const [overrides, setOverrides] = useState<HotkeyOverrides>({})
  useEffect(() => registry.onChange(setOverrides), [registry])
  return (
    <HotkeysProvider registry={registry} bindings={BINDINGS}>
      <div className="grid gap-4 font-(family-name:--tradecn-font-mono) text-xs sm:grid-cols-[1fr_12rem]">
        <HotkeyEditor onExport={setOverrides} />
        <div className="space-y-1">
          <p className="text-muted-foreground">what the app persists</p>
          <pre className="rounded-md border border-border bg-card p-2 text-xs">{JSON.stringify(overrides, null, 2)}</pre>
        </div>
      </div>
    </HotkeysProvider>
  )
}
