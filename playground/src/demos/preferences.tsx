import { useState } from "react"
import { createPreferences, diffPreferences, readSlot, setSlot } from "@/registry/tradecn/lib/preferences"

const baseline = setSlot(createPreferences(), "threshold", 5_000_000)

export default function PreferencesDemo() {
  const [prefs, setPrefs] = useState(baseline)
  const threshold = readSlot<number>(prefs, "threshold") ?? 0
  const diff = diffPreferences(baseline, prefs)

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs lining-nums tabular-nums">
        <button type="button" className="rounded border px-2 py-1" onClick={() => setPrefs((current) => setSlot(current, "threshold", 10_000_000))}>
          Set threshold to 10mm
        </button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => setPrefs(baseline)}>
          Restore baseline
        </button>
      </div>
      <div className="w-72 max-w-full space-y-2 text-sm lining-nums tabular-nums">
        <p>Threshold: {threshold.toLocaleString("en-US")}</p>
        <p role="status" className="text-muted-foreground">
          {diff.changed.length ? `Changed: ${diff.changed.join(", ")}` : "Matches the baseline."}
        </p>
      </div>
    </>
  )
}
