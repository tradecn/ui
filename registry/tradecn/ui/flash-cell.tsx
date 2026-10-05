import { cn } from "cn"
import { useCallback, useRef, type HTMLAttributes, type ReactNode, type Ref } from "react"
import { useFlash, type FlashOptions } from "@/registry/tradecn/hooks/use-flash"

export interface FlashCellProps extends Omit<HTMLAttributes<HTMLDivElement>, "children">, FlashOptions {
  /** The value to watch. A change flashes the cell, colored by direction. */
  value: unknown
  children?: ReactNode
}

/**
 * A cell that flashes when `value` changes: up, down, or flat, as a background fill or an inset ring.
 * Applies to the cell itself, not a span inside it. Zero change is flat. Reduced motion shows a
 * static color for the window instead of an animation.
 */
export function FlashCell({
  value,
  children,
  className,
  windowMs,
  variant = "fill",
  compare,
  flashOnEqual,
  memory,
  cellKey,
  disabled,
  now,
  revision,
  ref: forwardedRef,
  ...rest
}: FlashCellProps & { ref?: Ref<HTMLDivElement> }) {
  const ref = useRef<HTMLDivElement>(null)
  useFlash(ref, value, { windowMs, variant, compare, flashOnEqual, memory, cellKey, disabled, now, revision })
  // A trigger's asChild, a render prop, or a spreading wrapper injects a ref of its own; it
  // merges with the flash target instead of silently replacing it.
  const rootRef = useCallback((node: HTMLDivElement | null) => {
    ref.current = node
    if (typeof forwardedRef === "function") {
      const cleanup = forwardedRef(node)
      return () => {
        if (typeof cleanup === "function") cleanup()
        else forwardedRef(null)
      }
    }
    if (forwardedRef) forwardedRef.current = node
    return () => {
      if (forwardedRef && typeof forwardedRef !== "function") forwardedRef.current = null
    }
  }, [forwardedRef])
  return (
    <div
      ref={rootRef}
      data-slot="tradecn-flash-cell"
      data-variant={variant}
      data-numeric=""
      className={cn(
        "lining-nums tabular-nums",
        // The static color under reduced motion, and behind the animation while it runs.
        variant === "fill"
          ? "data-[direction=up]:bg-up-soft data-[direction=down]:bg-down-soft data-[direction=flat]:bg-flat-soft"
          : "data-[direction=up]:shadow-[inset_0_0_0_1px_var(--up)] data-[direction=down]:shadow-[inset_0_0_0_1px_var(--down)] data-[direction=flat]:shadow-[inset_0_0_0_1px_var(--flat)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
