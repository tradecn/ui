import { useState } from "react"
import { FlashCell } from "@/registry/tradecn/ui/flash-cell"

export default function FlashCellDemo() {
  const [quote, setQuote] = useState({ price: 100, change: 0 })

  function receive(change: number) {
    setQuote((previous) => ({ price: previous.price + change, change }))
  }

  return (
    <>
      <div data-demo-controls className="flex flex-wrap gap-2 text-xs lining-nums tabular-nums">
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => receive(0.25)}>Price +0.25</button>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => receive(-0.25)}>Price −0.25</button>
      </div>
      <div className="w-28 max-w-full space-y-2 text-xs lining-nums tabular-nums">
        <p className="text-muted-foreground">Price</p>
        <FlashCell value={quote.price} className="px-2 py-1 text-right">{quote.price.toFixed(2)}</FlashCell>
        <p role="status">{quote.change === 0 ? "No update yet" : quote.change > 0 ? "Up 0.25" : "Down 0.25"}</p>
      </div>
    </>
  )
}
