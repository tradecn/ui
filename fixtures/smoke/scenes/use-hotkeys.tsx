import { useState } from "react"
import { HotkeyScope, HotkeysProvider, useHotkey, useHotkeyList, usePendingChord } from "@/hooks/use-hotkeys"
import { formatKeys, type HotkeyBinding } from "@/lib/hotkeys"

const BINDINGS: HotkeyBinding[] = [
  { id: "smoke.chord", keys: "g s", scope: "global", description: "Chord" },
  { id: "smoke.panel", keys: "x", scope: "panel:smoke", description: "Panel key" },
]

function Readout() {
  const [chords, setChords] = useState(0)
  const [panel, setPanel] = useState(0)
  useHotkey("smoke.chord", () => setChords((n) => n + 1))
  useHotkey("smoke.panel", () => setPanel((n) => n + 1))
  const list = useHotkeyList()
  const pending = usePendingChord()
  return (
    <div data-slot="tradecn-use-hotkeys" data-chords={chords} data-panel={panel} data-pending={pending ?? ""}>
      {list.map((entry) => (
        <p key={entry.id}>
          {entry.description}: {formatKeys(entry.keys).flat().join(" ")}
        </p>
      ))}
      <button data-hotkeys-focus>focus the panel</button>
    </div>
  )
}

export function UseHotkeysScene() {
  return (
    <HotkeysProvider bindings={BINDINGS}>
      <HotkeyScope scope="panel:smoke">
        <Readout />
      </HotkeyScope>
    </HotkeysProvider>
  )
}
