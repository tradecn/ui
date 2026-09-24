import { useState } from "react"
import { FlashCell } from "@/registry/tradecn/ui/flash-cell"

export default function FlashCellReadingsDemo() {
  const [reading, setReading] = useState({ price: 100, change: 0, revision: 0 })

  function receive(change: number) {
    setReading((previous) => ({ price: previous.price + change, change, revision: previous.revision + 1 }))
  }

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs lining-nums tabular-nums">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => receive(0.25)}>Both +0.25</button>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => receive(-0.25)}>Both −0.25</button>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => receive(0)}>Repeat price</button>
      </div>
      <table className="w-52 max-w-full text-xs lining-nums tabular-nums">
        <caption className="caption-bottom pt-2" role="status">Reading {reading.revision}: {reading.revision === 0 ? "no update yet" : reading.change === 0 ? "unchanged" : reading.change > 0 ? "up 0.25" : "down 0.25"}</caption>
        <thead><tr>{["Fill", "Ring"].map((label) => <th key={label} scope="col" className="pb-2 text-left font-normal text-muted-foreground">{label}</th>)}</tr></thead>
        <tbody><tr>{(["fill", "ring"] as const).map((variant) => (
          <td key={variant} className="w-1/2">
            <FlashCell value={reading.price} revision={reading.revision} flashOnEqual variant={variant} className="px-2 py-1 text-right">{reading.price.toFixed(2)}</FlashCell>
          </td>
        ))}</tr></tbody>
      </table>
    </>
  )
}
