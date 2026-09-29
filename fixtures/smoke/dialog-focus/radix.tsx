import type { ComponentProps, RefObject } from "react"
import { DialogContent } from "@/components/ui/dialog"

export function useColumnMenuFocus(container: RefObject<HTMLElement | null>): Omit<ComponentProps<typeof DialogContent>, "children"> {
  return { onCloseAutoFocus: (event) => { event.preventDefault(); container.current?.querySelector<HTMLElement>("[role=grid]")?.focus() } }
}
