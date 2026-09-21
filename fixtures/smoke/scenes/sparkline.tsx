import { Sparkline } from "@/components/ui/sparkline"

const VALUES = [100, 101, null, 100.5, 102, 103]

// No width or height, so the size comes from the observer: the part a test without layout cannot reach.
export function SparklineScene() {
  return <Sparkline values={VALUES} label="Smoke" interactive pointLabel={(i) => `t${i}`} className="h-10 w-60" />
}
