import type { ComponentProps, RefObject } from "react"
import { DialogContent } from "@/components/ui/dialog"

export function useColumnMenuFocus(container: RefObject<HTMLElement | null>): Omit<ComponentProps<typeof DialogContent>, "children"> {
  return { finalFocus: () => container.current?.querySelector<HTMLElement>("[role=grid]") ?? false }
}
