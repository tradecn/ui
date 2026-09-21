import { useEffect, useMemo, useState } from "react"
import { createFlashMemory } from "@/registry/tradecn/hooks/use-flash"
import { formatPrice } from "@/registry/tradecn/lib/format"
import { FlashCell } from "@/registry/tradecn/ui/flash-cell"

const SYMBOLS = ["ZT", "ZF", "ZN", "TN", "ZB", "UB", "ES", "NQ"]

export default function FlashCellDemo() {
  // One memory for every cell, keyed by cellKey: a row that scrolls back into view does not flash again.
  const memory = useMemo(() => createFlashMemory(), [])
  const [rows, setRows] = useState(() => SYMBOLS.map((symbol, i) => ({ symbol, px: 100 + i })))
  useEffect(() => {
    const t = setInterval(() => {
      setRows((rs) =>
        rs.map((r) => {
          if (Math.random() > 0.3) return r
          // One change in eight is zero, which flashes flat: the same value arrived again.
          const d = Math.random() < 0.125 ? 0 : (Math.random() - 0.5) * 0.5
          return { ...r, px: Number((r.px + d).toFixed(2)) }
        }),
      )
    }, 250)
    return () => clearInterval(t)
  }, [])
  return (
    <table className="w-full font-mono text-xs tabular-nums">
      <thead>
        <tr className="text-muted-foreground">
          <th className="py-1 text-left font-normal">Symbol</th>
          <th className="py-1 text-right font-normal">fill</th>
          <th className="py-1 text-right font-normal">ring</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol} className="border-b border-border">
            <td className="py-0.5 pr-3 font-semibold">{r.symbol}</td>
            {(["fill", "ring"] as const).map((variant) => (
              <td key={variant} className="py-0.5 pl-3">
                <FlashCell value={r.px} variant={variant} memory={memory} cellKey={`${r.symbol}:${variant}`} className="px-1 text-right">
                  {formatPrice(r.px, { kind: "decimal", decimals: 2 })}
                </FlashCell>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
