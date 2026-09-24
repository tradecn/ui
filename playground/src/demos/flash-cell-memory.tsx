import { useState } from "react"
import { createFlashMemory } from "@/registry/tradecn/hooks/use-flash"
import { FlashCell } from "@/registry/tradecn/ui/flash-cell"

export default function FlashCellMemoryDemo() {
  const [memory] = useState(() => createFlashMemory(1))
  const [price, setPrice] = useState(100)
  const [visible, setVisible] = useState(true)

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="rounded border border-border px-2 py-1 disabled:opacity-50" disabled={!visible} onClick={() => setPrice((previous) => previous + 0.25)}>Raise both prices</button>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setVisible((previous) => !previous)}>{visible ? "Hide cells" : "Show cells"}</button>
      </div>
      <table className="w-52 max-w-full text-xs lining-nums tabular-nums">
        <caption className="caption-bottom pt-2"><span role="status">{price === 100 ? "No update yet" : "Last change: up 0.25"}</span></caption>
        <thead><tr><th scope="col" className="pb-2 text-left font-normal text-muted-foreground">Local memory</th><th scope="col" className="pb-2 text-left font-normal text-muted-foreground">Shared memory</th></tr></thead>
        <tbody><tr>
          <td className="w-1/2">{visible ? <FlashCell value={price} windowMs={5000} className="px-2 py-1 text-right">{price.toFixed(2)}</FlashCell> : <span className="block px-2 py-1 text-right text-muted-foreground">Hidden</span>}</td>
          <td className="w-1/2">{visible ? <FlashCell value={price} windowMs={5000} memory={memory} cellKey="quote:price" className="px-2 py-1 text-right">{price.toFixed(2)}</FlashCell> : <span className="block px-2 py-1 text-right text-muted-foreground">Hidden</span>}</td>
        </tr></tbody>
      </table>
    </>
  )
}
