import { cn } from "cn"
import { useLayoutEffect, useMemo, useState, type ComponentProps, type KeyboardEvent, type PointerEvent } from "react"
import { directionOf, type Direction } from "@/registry/tradecn/hooks/use-flash"
import { buildSparklineGeometry, nearestPointIndex, observeSize, type Size } from "@/registry/tradecn/lib/sparkline-geometry"

// A line small enough for a grid cell that still says which way, how far, and between what.
//
// The color is the direction of the last reading against the first, or against a baseline such as a
// previous close, and the same direction is in `data-direction` and in the words a screen reader
// gets, because color is never the only channel. Give it a width and a height and it measures
// nothing; leave them out and it fills its box, through one ResizeObserver shared by every
// sparkline on the page.

export type SparklineDirection = Direction | "auto" | "none"

export interface SparklineProps extends Omit<ComponentProps<"div">, "children"> {
  /** Readings in order. A null, undefined, or NaN is a gap: the line breaks and the later points stay where they belong. */
  values: readonly (number | null | undefined)[]
  /** What this is, for a screen reader: "ZN, last 30 minutes". The direction, last, low, and high are added. */
  label: string
  /** `auto` compares the last reading with the baseline, or with the first reading. `none` draws in the foreground color. Default `auto`. */
  direction?: SparklineDirection
  /** A level to compare against and to draw: a previous close. */
  baseline?: number
  /** Both given, the size is fixed and nothing is observed. That is the cheap way in a grid column. */
  width?: number
  height?: number
  /** Tint under the line. Default true. */
  area?: boolean
  /** A crosshair you can move with the pointer and with the arrow keys. Default false, so a cell stays inert. */
  interactive?: boolean
  format?: (value: number) => string
  /** Names a reading in the crosshair's readout, by its index in `values`: a time. */
  pointLabel?: (index: number) => string
}

type Tone = Direction | "none"

const STROKE: Record<Tone, string> = { up: "stroke-up", down: "stroke-down", flat: "stroke-flat", none: "stroke-foreground/70" }
const AREA: Record<Tone, string> = { up: "fill-up-soft", down: "fill-down-soft", flat: "fill-flat-soft", none: "fill-foreground/10" }
const MARKER: Record<Tone, string> = { up: "fill-up", down: "fill-down", flat: "fill-flat", none: "fill-foreground" }
const WORD: Record<Tone, string> = { up: "up", down: "down", flat: "flat", none: "" }

const defaultFormat = (value: number) => String(value)

export function Sparkline({ values, label, direction = "auto", baseline, width, height, area = true, interactive = false, format = defaultFormat, pointLabel, className, style, ...props }: SparklineProps) {
  const fixed = width !== undefined && height !== undefined
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [measured, setMeasured] = useState<Size | null>(null)
  const [active, setActive] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (fixed || !element) return
    return observeSize(element, setMeasured)
  }, [fixed, element])

  // Two numbers, not an object: at a fixed size an object would be new on every render and the geometry with it.
  const w = fixed ? width : measured?.width
  const h = fixed ? height : measured?.height
  const geometry = useMemo(() => (w === undefined || h === undefined ? null : buildSparklineGeometry(values, w, h, { baseline })), [values, w, h, baseline])
  const points = geometry?.points ?? []
  const first = points[0]
  const last = points[points.length - 1]
  const tone: Tone = direction === "auto" ? (first && last ? directionOf(baseline ?? first.value, last.value) : "flat") : direction
  // The series can get shorter under a crosshair that was parked at its end.
  const at = active === null || !points.length ? null : points[Math.min(active, points.length - 1)]!

  const describe = (index: number, value: number) => `${pointLabel ? `${pointLabel(index)} ` : ""}${format(value)}`
  // Scanned once per render instead of taken from the geometry, so the words are right before the first measurement too.
  let low = Infinity
  let high = -Infinity
  let latest: number | null = null
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue
    latest = v
    if (v < low) low = v
    if (v > high) high = v
  }
  const summary = latest === null ? `${label}: no data` : `${label}: ${WORD[tone] ? `${WORD[tone]}, ` : ""}last ${format(latest)}, low ${format(low)}, high ${format(high)}`

  function move(to: number) {
    if (points.length) setActive(Math.max(0, Math.min(points.length - 1, to)))
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    props.onKeyDown?.(event)
    if (event.defaultPrevented || !points.length) return
    const from = active === null ? points.length - 1 : Math.min(active, points.length - 1)
    const to = { ArrowLeft: from - 1, ArrowRight: from + 1, PageDown: from - 10, PageUp: from + 10, Home: 0, End: points.length - 1 }[event.key]
    if (to === undefined && event.key !== "Escape") return
    // Claimed, so a grid or a hotkey dispatcher further out leaves the key alone.
    event.preventDefault()
    if (to === undefined) setActive(null)
    else move(to)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    props.onPointerMove?.(event)
    if (w === undefined) return
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width > 0) move(nearestPointIndex(points, ((event.clientX - box.left) / box.width) * w))
  }

  const live = interactive && points.length > 0
  return (
    <div
      role={live ? "slider" : "img"}
      aria-label={live ? label : summary}
      {...(live
        ? { tabIndex: 0, "aria-orientation": "horizontal" as const, "aria-valuemin": 0, "aria-valuemax": points.length - 1, "aria-valuenow": at ? points.indexOf(at) : points.length - 1, "aria-valuetext": at ? describe(at.index, at.value) : summary }
        : {})}
      {...props}
      ref={setElement}
      data-slot="tradecn-sparkline"
      data-direction={tone}
      data-empty={points.length === 0 && latest === null ? "" : undefined}
      onKeyDown={live ? onKeyDown : props.onKeyDown}
      onPointerMove={live ? onPointerMove : props.onPointerMove}
      onPointerLeave={(event) => {
        props.onPointerLeave?.(event)
        if (live && document.activeElement !== event.currentTarget) setActive(null)
      }}
      onFocus={(event) => {
        props.onFocus?.(event)
        if (live && active === null) setActive(points.length - 1)
      }}
      onBlur={(event) => {
        props.onBlur?.(event)
        if (live) setActive(null)
      }}
      className={cn("relative inline-block h-6 w-24 shrink-0 align-middle outline-none lining-nums tabular-nums", live && "cursor-crosshair rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50", className)}
      style={fixed ? { ...style, width, height } : style}
    >
      {geometry && w !== undefined && h !== undefined && (
        <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block overflow-visible" fill="none">
          {geometry.baselineY !== null && <line x1={0} x2={w} y1={geometry.baselineY} y2={geometry.baselineY} className="stroke-border" strokeWidth={1} strokeDasharray="2 2" />}
          {area && geometry.area && <path d={geometry.area} className={AREA[tone]} stroke="none" />}
          <path d={geometry.line} className={STROKE[tone]} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          {live && at && (
            <>
              <line x1={at.x} x2={at.x} y1={0} y2={h} className="stroke-muted-foreground/60" strokeWidth={1} />
              <circle cx={at.x} cy={at.y} r={2.5} className={MARKER[tone]} />
            </>
          )}
        </svg>
      )}
      {live && at && w !== undefined && (
        <span data-sparkline-readout="" data-numeric="" className={cn("pointer-events-none absolute -top-4 rounded-sm bg-popover px-1 text-xs leading-4 whitespace-nowrap text-popover-foreground lining-nums tabular-nums shadow-sm", at.x > w / 2 ? "right-0" : "left-0")}>
          {describe(at.index, at.value)}
        </span>
      )}
    </div>
  )
}
