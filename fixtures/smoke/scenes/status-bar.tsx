import { StatusBar, StatusBarEnvironmentBadge, StatusBarClocks, StatusBarClockReadout, StatusBarUser } from "@/components/ui/status-bar"

export function StatusBarScene() {
  return (
    <div className="w-[40rem] max-w-full">
      <StatusBar data-environment="UAT">
        <StatusBarEnvironmentBadge label="UAT" tone="stale" />
        <div className="flex shrink-0 items-center gap-2" data-status-slot="left"><span data-status-child>feeds ok</span></div>
        <div className="min-w-4 flex-1" data-status-slot="center" />
        <StatusBarClocks><StatusBarClockReadout label="UTC" zone="UTC" /></StatusBarClocks>
        <StatusBarUser user="smoke" />
      </StatusBar>
    </div>
  )
}
