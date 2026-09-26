import { useEffect, useState } from "react"
import {
  HotkeyEditor,
  HotkeyEditorSearch,
  HotkeyEditorItem,
  HotkeyEditorKeys,
  HotkeyEditorChange,
  HotkeyEditorEdit,
  HotkeyEditorReset,
  HotkeyEditorResetAll,
  HotkeyEditorCapture,
  HotkeyEditorInput,
  HotkeyEditorProblem,
  HotkeyEditorConflicts,
  useHotkeyEditor,
  useHotkeyEditorItem,
} from "@/components/ui/hotkey-editor"
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
        <HotkeyEditor><HotkeyEditorGroups /></HotkeyEditor>
      </div>
    </HotkeysProvider>
  )
}

function ShortcutRow() {
  const { entry } = useHotkeyEditorItem()
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">{entry.description}</span>
        {entry.remapped && <span className="rounded border px-1 text-muted-foreground">changed</span>}
        <HotkeyEditorKeys />
        <div className="flex flex-wrap gap-1">
          <HotkeyEditorChange>Change</HotkeyEditorChange>
          <HotkeyEditorEdit>Type it</HotkeyEditorEdit>
          {entry.remapped && <HotkeyEditorReset>Reset</HotkeyEditorReset>}
        </div>
      </div>
      <HotkeyEditorCapture />
      <HotkeyEditorInput />
      <HotkeyEditorProblem />
      <HotkeyEditorConflicts />
    </>
  )
}

function HotkeyEditorGroups() {
  const { groups } = useHotkeyEditor()
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <HotkeyEditorSearch />
        <div className="ml-auto flex flex-wrap gap-1">
          <HotkeyEditorResetAll>Reset all</HotkeyEditorResetAll>
        </div>
      </div>
      {groups.length === 0 && <p className="text-muted-foreground">No shortcut matches.</p>}
      {groups.map((group) => (
        <section key={group.name} aria-label={group.name} data-hotkey-group={group.name}>
          <h3 className="mb-1 font-semibold text-muted-foreground">{group.name}</h3>
          {group.entries.map((entry) => (
            <HotkeyEditorItem key={entry.id} bindingId={entry.id} className="border-b border-border py-2 last:border-b-0">
              <ShortcutRow />
            </HotkeyEditorItem>
          ))}
        </section>
      ))}
    </>
  )
}
