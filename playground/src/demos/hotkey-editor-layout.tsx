import { HotkeysProvider } from "@/registry/tradecn/hooks/use-hotkeys"
import type { HotkeyBinding } from "@/registry/tradecn/lib/hotkeys"
import {
  HotkeyEditor,
  HotkeyEditorSearch,
  HotkeyEditorItem,
  HotkeyEditorKeys,
  HotkeyEditorEdit,
  HotkeyEditorInput,
  HotkeyEditorProblem,
  HotkeyEditorConflicts,
  HotkeyEditorResetAll,
  useHotkeyEditor,
} from "@/registry/tradecn/ui/hotkey-editor"

const BINDINGS: HotkeyBinding[] = [
  { id: "go.blotter", keys: "g b", scope: "global", description: "Go to the blotter" },
  { id: "go.book", keys: "g o", scope: "global", description: "Go to the book" },
]

function ShortcutCards() {
  const { groups } = useHotkeyEditor()
  const entries = groups.flatMap((group) => group.entries).reverse()
  return (
    <>
      <p className="text-muted-foreground">Use a sequence such as g b to move between views.</p>
      <HotkeyEditorSearch />
      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map((entry) => (
          <HotkeyEditorItem key={entry.id} bindingId={entry.id} className="gap-3 rounded-md border p-3">
            <h3 className="font-medium">{entry.description}</h3>
            <HotkeyEditorKeys />
            {entry.remapped && <span className="text-muted-foreground">changed</span>}
            <HotkeyEditorEdit className="self-start" variant="outline">Type it</HotkeyEditorEdit>
            <HotkeyEditorInput className="w-full" />
            <HotkeyEditorProblem />
            <HotkeyEditorConflicts />
          </HotkeyEditorItem>
        ))}
      </div>
      {entries.length === 0 && <p className="text-muted-foreground">No shortcut matches.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a href="https://tradecn.dev/docs/use-hotkeys/" className="underline underline-offset-4">Shortcut reference</a>
        <HotkeyEditorResetAll>Reset all</HotkeyEditorResetAll>
      </div>
    </>
  )
}

export default function HotkeyEditorLayoutDemo() {
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <HotkeyEditor className="w-xl max-w-full gap-3">
        <ShortcutCards />
      </HotkeyEditor>
    </HotkeysProvider>
  )
}
