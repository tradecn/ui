import { useEffect, useState } from "react"
import { HotkeyEditor } from "@/components/ui/hotkey-editor"
import { HotkeysProvider } from "@/hooks/use-hotkeys"
import { createHotkeyRegistry, type HotkeyBinding, type HotkeyOverrides } from "@/lib/hotkeys"

const BINDINGS: HotkeyBinding[] = [
  { id: "edit.go", keys: "g b", scope: "global", description: "Go to the blotter", group: "Go" },
  { id: "edit.book", keys: "g o", scope: "global", description: "Go to the book", group: "Go" },
  { id: "edit.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order" },
]

export function HotkeyEditorScene() {
  const [registry] = useState(() => createHotkeyRegistry())
  const [overrides, setOverrides] = useState<HotkeyOverrides>({})
  useEffect(() => registry.onChange(setOverrides), [registry])
  return (
    <HotkeysProvider registry={registry} bindings={BINDINGS}>
      <div className="w-[36rem]" data-hotkey-saved={JSON.stringify(overrides)}>
        <HotkeyEditor />
      </div>
    </HotkeysProvider>
  )
}
