import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";

/** On-hand quantity, highlighted amber when low and red when out of stock. */
export function OnHand({ value, unit, low }: { value: number; unit?: string; low: boolean }) {
  const text = `${formatNumber(value)}${unit ? ` ${unit}` : ""}`;
  if (!low && value > 0) return <span className="tabular-nums">{text}</span>;
  if (!low) return <span className="tabular-nums text-ink-faint">{text}</span>;
  return <Badge tone={value <= 0 ? "red" : "amber"}>{text}</Badge>;
}

/** Signed movement quantity: green for stock in, red for stock out. */
export function SignedQty({ value }: { value: number }) {
  const tone = value > 0 ? "text-emerald-700" : value < 0 ? "text-red-600" : "text-ink";
  return (
    <span className={`font-medium tabular-nums ${tone}`}>
      {value > 0 ? "+" : ""}
      {formatNumber(value)}
    </span>
  );
}
