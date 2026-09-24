import { useState } from "react"
import { boundaryOf, createPreferences, exportableSlots, exportPreferences, readSlot, setSlot } from "@/registry/tradecn/lib/preferences"

const columns = {
  order: ["symbol", "qty", "account"],
  widths: {},
  hidden: ["account"],
}
let baseline = createPreferences({
  template: ["columns:blotter"],
  user: ["hotkeys"],
  session: ["threshold"],
})
baseline = setSlot(baseline, "columns:blotter", columns)
baseline = setSlot(baseline, "hotkeys", { "rfq.send": "mod+shift+enter" })
baseline = setSlot(baseline, "threshold", 5_000_000)

export default function PreferencesBoundariesDemo() {
  const [prefs, setPrefs] = useState(baseline)
  const [boundary, setBoundary] = useState<"template" | "user">("template")
  const threshold = readSlot<number>(prefs, "threshold") ?? 0

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs lining-nums tabular-nums">
        <button
          type="button"
          className="rounded border px-2 py-1"
          onClick={() =>
            setPrefs((current) =>
              setSlot(current, "columns:blotter", {
                ...columns,
                hidden: ["account", "qty"],
              }),
            )
          }
        >
          Hide quantity
        </button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => setPrefs((current) => setSlot(current, "threshold", 10_000_000))}>
          Raise session threshold
        </button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => setPrefs(baseline)}>
          Restore settings
        </button>
      </div>
      <div className="w-96 max-w-full space-y-3 text-xs lining-nums tabular-nums">
        <table className="w-full text-left">
          <thead className="text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 font-medium">
                Slot
              </th>
              <th scope="col" className="font-medium">
                Boundary
              </th>
              <th scope="col" className="text-right font-medium">
                Version
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(prefs.slots).map(([name, slot]) => (
              <tr key={name} className="border-t border-border">
                <th scope="row" className="py-1 font-normal">
                  {name}
                </th>
                <td>{boundaryOf(prefs, name)}</td>
                <td className="text-right">{slot.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Session threshold: {threshold.toLocaleString("en-US")}</p>
        <label className="flex flex-wrap items-center gap-2">
          Export boundary
          <select className="rounded border border-border bg-background p-1" value={boundary} onChange={(event) => setBoundary(event.target.value === "template" ? "template" : "user")}>
            <option value="template">Desk template</option>
            <option value="user">Personal settings</option>
          </select>
        </label>
        <p role="status" className="text-muted-foreground">
          Exported slots: {exportableSlots(prefs, boundary).join(", ")}
        </p>
        <pre role="region" aria-label="Exported preferences" tabIndex={0} className="max-h-64 overflow-auto rounded-md border border-border bg-card p-3 font-(family-name:--tradecn-font-mono)">
          {exportPreferences(prefs, { boundary })}
        </pre>
      </div>
    </>
  )
}
