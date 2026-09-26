import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import { type HotkeyBinding, type HotkeyOverrides } from "@/registry/tradecn/lib/hotkeys"
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
} from "@/registry/tradecn/ui/hotkey-editor"

const BINDINGS: HotkeyBinding[] = [
  { id: "palette.open", keys: "mod+k", scope: "editing", description: "Open the command palette", group: "General" },
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter", group: "Go" },
  { id: "go.inquiries", keys: "g i", scope: "global", description: "Go to the inquiries", group: "Go" },
  { id: "rfq.send", keys: "mod+enter", scope: "editing", description: "Send the quote", group: "Inquiry" },
  { id: "book.cancel", keys: "x", scope: "panel:book", description: "Cancel the selected order" },
]

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

export function HotkeyEditorGroups({ children }: { children?: ReactNode }) {
  const { groups } = useHotkeyEditor()
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <HotkeyEditorSearch />
        <div className="ml-auto flex flex-wrap gap-1">
          {children}
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

function ExportButton({ onExport }: { onExport: (overrides: HotkeyOverrides) => void }) {
  const { registry } = useHotkeyEditor()
  return <Button type="button" size="sm" variant="outline" onClick={() => onExport(registry.overrides())}>Export</Button>
}

export default function HotkeyEditorGroupsDemo() {
  const [exported, setExported] = useState<HotkeyOverrides | null>(null)
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <div className="flex w-xl max-w-full flex-col gap-3 text-xs lining-nums tabular-nums">
        <HotkeyEditor>
          <HotkeyEditorGroups><ExportButton onExport={setExported} /></HotkeyEditorGroups>
        </HotkeyEditor>
        {exported !== null && (
          <section aria-label="Exported overrides" className="flex flex-col gap-1">
            <p className="text-muted-foreground">Exported overrides</p>
            <pre tabIndex={0} role="region" aria-label="Exported overrides JSON" className="max-h-36 overflow-auto rounded-md border border-border bg-card p-2 font-(family-name:--tradecn-font-mono) text-xs">{JSON.stringify(exported, null, 2)}</pre>
          </section>
        )}
      </div>
    </HotkeysProvider>
  )
}
