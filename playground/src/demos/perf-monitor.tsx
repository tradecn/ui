import { type ReactNode } from "react"
import { PerfMonitor, PerfMonitorHistogram, PerfMonitorValue } from "@/registry/tradecn/ui/perf-monitor"

export function FrameReadings({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 lining-nums tabular-nums" data-numeric="">
      <span data-perf="frames"><span className="text-muted-foreground">frames </span><PerfMonitorValue metric="frames" /></span>
      <span data-perf="p50"><span className="text-muted-foreground">p50 </span><PerfMonitorValue metric="p50" /></span>
      <span data-perf="p99"><span className="text-muted-foreground">p99 </span><PerfMonitorValue metric="p99" /></span>
      <span data-perf="max"><span className="text-muted-foreground">max </span><PerfMonitorValue metric="max" /></span>
      <span data-perf="dropped"><span className="text-muted-foreground">dropped </span><PerfMonitorValue metric="dropped" /></span>
      <span data-perf="long"><span className="text-muted-foreground">long </span><PerfMonitorValue metric="long" /></span>
      {children}
    </div>
  )
}

export default function PerfMonitorDemo() {
  return (
    <PerfMonitor className="w-80 max-w-full">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PerfMonitorHistogram />
        <FrameReadings />
      </div>
    </PerfMonitor>
  )
}
