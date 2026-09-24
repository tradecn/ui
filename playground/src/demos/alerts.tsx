import { Alerts, AlertsList, AlertItem, AlertHeader, AlertTitle, AlertBody, AlertSeverity } from "@/registry/tradecn/ui/alerts"

export default function AlertsDemo() {
  return (
    <Alerts className="w-lg max-w-full">
      <AlertsList>
        <AlertItem>
          <AlertHeader>
            <AlertSeverity>fill</AlertSeverity>
            <AlertTitle>Order filled</AlertTitle>
          </AlertHeader>
          <AlertBody>5mm UST at 99-16+</AlertBody>
        </AlertItem>
      </AlertsList>
    </Alerts>
  )
}
