import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import {
  HotkeyEditor,
  HotkeyEditorItem,
  HotkeyEditorKeys,
  HotkeyEditorChange,
  HotkeyEditorEdit,
  HotkeyEditorReset,
  HotkeyEditorCapture,
  HotkeyEditorInput,
  HotkeyEditorProblem,
  HotkeyEditorConflicts,
  useHotkeyEditorItem,
} from "@/registry/tradecn/ui/hotkey-editor"

const BINDINGS: HotkeyBinding[] = [
  { id: "palette.open", keys: "mod+k", scope: "editing", description: "Open the command palette" },
]

function Shortcut() {
  const { entry } = useHotkeyEditorItem()
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">{entry.description}</span>
        {entry.remapped && <span className="text-muted-foreground">changed</span>}
        <HotkeyEditorKeys />
      </div>
      <div className="flex flex-wrap gap-1">
        <HotkeyEditorChange>Change</HotkeyEditorChange>
        <HotkeyEditorEdit>Type it</HotkeyEditorEdit>
        {entry.remapped && <HotkeyEditorReset>Reset</HotkeyEditorReset>}
      </div>
      <HotkeyEditorCapture />
      <HotkeyEditorInput />
      <HotkeyEditorProblem />
      <HotkeyEditorConflicts />
    </>
  )
}

export default function HotkeyEditorDemo() {
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <HotkeyEditor className="w-sm max-w-full">
        <HotkeyEditorItem bindingId="palette.open">
          <Shortcut />
        </HotkeyEditorItem>
      </HotkeyEditor>
    </HotkeysProvider>
  )
}
