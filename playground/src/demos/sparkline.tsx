import { useEffect, useState } from "react"
import { directionClass, directionOf } from "@/registry/tradecn/hooks/use-flash"
import { formatPrice, formatSigned } from "@/registry/tradecn/lib/format"
import { Sparkline } from "@/registry/tradecn/ui/sparkline"

const SYMBOLS = ["ZT", "ZF", "ZN", "ZB", "ES", "CL"]
const LENGTH = 60

type Series = (number | null)[]

function walk(start: number): Series {
  const out: Series = []
  let px = start
  for (let i = 0; i < LENGTH; i++) {
    px += (Math.random() - 0.5) * 0.25
    out.push(Number(px.toFixed(3)))
  }
  return out
}

function tick(series: Series): Series {
  const last = [...series].reverse().find((v): v is number => v !== null) ?? 100
  // One reading in twelve goes missing, so the gaps are easy to see.
  const next = Math.random() < 1 / 12 ? null : Number((last + (Math.random() - 0.5) * 0.25).toFixed(3))
  return [...series.slice(1), next]
}

const price = (v: number) => formatPrice(v, { kind: "decimal", decimals: 3 })
const minutesAgo = (i: number) => (i === LENGTH - 1 ? "now" : `-${LENGTH - 1 - i}m`)

export default function SparklineDemo() {
  const [rows, setRows] = useState(() => SYMBOLS.map((symbol, i) => ({ symbol, open: 100 + i, series: walk(100 + i) })))
  useEffect(() => {
    const t = setInterval(() => setRows((rs) => rs.map((r) => ({ ...r, series: tick(r.series) }))), 500)
    return () => clearInterval(t)
  }, [])
  const lead = rows[2]!
  return (
    <div className="space-y-4 font-mono text-xs tabular-nums">
      {/* A fixed size in a table: nothing is observed. The dashed line is the open each one is compared against. */}
      <table className="w-full">
        <tbody>
          {rows.map((r) => {
            const last = [...r.series].reverse().find((v): v is number => v !== null) ?? r.open
            return (
              <tr key={r.symbol} className="border-b border-border">
                <td className="py-0.5 pr-3 font-semibold">{r.symbol}</td>
                <td className="py-0.5 pr-3 text-right">{price(last)}</td>
                <td className={`py-0.5 pr-3 text-right ${directionClass(directionOf(r.open, last))}`}>{formatSigned(last - r.open, { decimals: 3 })}</td>
                <td className="py-0.5">
                  <Sparkline values={r.series} baseline={r.open} label={`${r.symbol}, last hour`} format={price} width={120} height={20} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {/* Fills its box through the shared observer, and takes a crosshair: Tab to it, then the arrow keys, Home, End, Escape. */}
      <div className="h-32 rounded-md border border-border p-3">
        <Sparkline values={lead.series} baseline={lead.open} label={`${lead.symbol}, last hour`} format={price} pointLabel={minutesAgo} interactive className="h-full w-full" />
      </div>
    </div>
  )
}
