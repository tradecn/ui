import { Sparkline } from "@/registry/tradecn/ui/sparkline"

const prices = [99.5, 99.52, null, 99.56, null, 99.53, 99.55]
const previousClose = 99.6

export default function SparklineBaselineDemo() {
  return (
    <figure className="w-52 max-w-full space-y-3 text-xs lining-nums tabular-nums">
      <Sparkline values={prices} baseline={previousClose} label="ABC, 10:00–10:06, against previous close" width={208} height={64} format={(value) => value.toFixed(2)} />
      <figcaption className="text-muted-foreground">Last: 99.55. Down from the previous close of {previousClose.toFixed(2)}.</figcaption>
    </figure>
  )
}
