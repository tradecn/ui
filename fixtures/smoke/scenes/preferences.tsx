import { useMemo } from "react"
import { createPreferences, exportableSlots, importPreferences, parsePreferences, setSlot } from "@/lib/preferences"

// A lib has no element of its own; the scene wraps a round trip in the slot the smoke test counts.
export function PreferencesScene() {
  const text = useMemo(() => {
    let prefs = createPreferences({ template: ["layout"], user: ["hotkeys"], session: ["threshold"] })
    prefs = setSlot(prefs, "layout", { version: 1, kind: "tradecn-workspace" })
    prefs = setSlot(prefs, "hotkeys", { "go.blotter": "g b" })
    prefs = setSlot(prefs, "threshold", 5_000_000)
    const back = parsePreferences(JSON.stringify(prefs))
    const merged = back ? importPreferences(createPreferences(), back, { boundary: "template" }) : null
    return `${exportableSlots(prefs, "template").join(",")} | ${exportableSlots(prefs).join(",")} | ${Object.keys(merged?.slots ?? {}).join(",")}`
  }, [])
  return (
    <div data-slot="tradecn-preferences" className="text-xs lining-nums tabular-nums">
      {text}
    </div>
  )
}
