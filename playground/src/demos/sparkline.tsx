import { Sparkline } from "@/registry/tradecn/ui/sparkline"

const prices = [99.5, 99.52, 99.51, 99.56, 99.54, 99.55]

export default function SparklineDemo() {
  return <Sparkline values={prices} label="ABC, 10:00–10:05" width={160} height={40} format={(value) => value.toFixed(2)} />
}
