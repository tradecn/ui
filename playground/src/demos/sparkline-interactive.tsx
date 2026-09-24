import { useState } from "react"
import { Sparkline } from "@/registry/tradecn/ui/sparkline"

const prices = [99.5, 99.52, null, 99.56, 99.54, 99.55]

export default function SparklineInteractiveDemo() {
  const [narrow, setNarrow] = useState(false)

  return (
    <>
      <div data-demo-controls className="text-xs"><label className="flex items-center gap-1"><input type="checkbox" checked={narrow} onChange={(event) => setNarrow(event.target.checked)} />Narrow chart</label></div>
      <div className="max-w-full space-y-3 text-xs" style={{ width: narrow ? 192 : 384 }}>
        <div className="pt-5">
          <Sparkline values={prices} label="ABC, 10:00–10:05, interactive history" interactive format={(value) => value.toFixed(2)} pointLabel={(index) => `10:0${index}`} className="h-24 w-full" />
        </div>
        <p className="text-muted-foreground">Focus the chart and use the arrow keys. Home and End select the first and last readings; Escape hides the crosshair.</p>
      </div>
    </>
  )
}
