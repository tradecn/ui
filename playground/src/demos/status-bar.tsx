import { StatusBar, StatusBarEnvironmentBadge, StatusBarClocks, StatusBarClockReadout, StatusBarUser } from "@/registry/tradecn/ui/status-bar"

export default function StatusBarDemo() {
  return (
    <div className="w-xl max-w-full">
      <StatusBar data-environment="PRODUCTION">
        <StatusBarEnvironmentBadge label="PRODUCTION" tone="destructive" />
        <div className="min-w-4 flex-1" data-status-slot="center" />
        <StatusBarClocks>
          <StatusBarClockReadout label="New York" zone="America/New_York" />
        </StatusBarClocks>
        <StatusBarUser user="jdoe" />
      </StatusBar>
    </div>
  )
}
