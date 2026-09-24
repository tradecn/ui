import { useState } from "react"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { type HotkeyBinding, type HotkeyOverrides } from "@/registry/tradecn/lib/hotkeys"
import { HotkeyEditor } from "@/registry/tradecn/ui/hotkey-editor"

const BINDINGS: HotkeyBinding[] = [
  { id: "palette.open", keys: "mod+k", scope: "editing", description: "Open the command palette", group: "General" },
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter", group: "Go" },
  { id: "go.inquiries", keys: "g i", scope: "global", description: "Go to the inquiries", group: "Go" },
  { id: "rfq.send", keys: "mod+enter", scope: "editing", description: "Send the quote", group: "Inquiry" },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order" },
]

export default function HotkeyEditorDemo() {
  const [exported, setExported] = useState<HotkeyOverrides | null>(null)
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <div className="w-xl max-w-full space-y-3 text-xs lining-nums tabular-nums">
        <HotkeyEditor onExport={setExported} />
        {exported !== null && (
          <section aria-label="Exported overrides" className="space-y-1">
            <p className="text-muted-foreground">Exported overrides</p>
            <pre tabIndex={0} role="region" aria-label="Exported overrides JSON" className="max-h-36 overflow-auto rounded-md border border-border bg-card p-2 font-(family-name:--tradecn-font-mono) text-xs">{JSON.stringify(exported, null, 2)}</pre>
          </section>
        )}
      </div>
    </HotkeysProvider>
  )
}
