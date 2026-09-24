import { useState } from "react"
import { createPreferences, diffPreferences, exportPreferences, importPreferences, setSlot } from "@/registry/tradecn/lib/preferences"

function desk(hidden: string[], shortcut: string, threshold: number) {
  let prefs = createPreferences({
    template: ["columns:blotter"],
    user: ["hotkeys"],
    session: ["threshold"],
  })
  prefs = setSlot(prefs, "columns:blotter", {
    order: ["symbol", "qty", "account"],
    widths: {},
    hidden,
  })
  prefs = setSlot(prefs, "hotkeys", { "rfq.send": shortcut })
  return setSlot(prefs, "threshold", threshold)
}

const incoming = exportPreferences(desk(["account", "qty"], "mod+shift+enter", 5_000_000))
const baseline = desk([], "mod+enter", 1_000_000)

export default function PreferencesImportDemo() {
  const [prefs, setPrefs] = useState(baseline)
  const diff = diffPreferences(baseline, prefs)

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs lining-nums tabular-nums">
        <button
          type="button"
          className="rounded border px-2 py-1"
          onClick={() =>
            setPrefs(
              (current) =>
                importPreferences(current, incoming, {
                  boundary: "template",
                }) ?? current,
            )
          }
        >
          Import template
        </button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => setPrefs((current) => importPreferences(current, incoming) ?? current)}>
          Import personal settings
        </button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => setPrefs(baseline)}>
          Restore receiving desk
        </button>
      </div>
      <div className="w-96 max-w-full space-y-3 text-xs lining-nums tabular-nums">
        <p role="status" className="text-muted-foreground">
          {diff.changed.length ? `Changed: ${diff.changed.join(", ")}` : "Receiving desk unchanged."}
        </p>
        <pre role="region" aria-label="Receiving desk slots" tabIndex={0} className="max-h-80 overflow-auto rounded-md border border-border bg-card p-3 font-(family-name:--tradecn-font-mono)">
          {JSON.stringify(prefs.slots, null, 2)}
        </pre>
      </div>
    </>
  )
}
