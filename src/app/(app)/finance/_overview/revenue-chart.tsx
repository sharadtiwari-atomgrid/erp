import type { Overview } from "./data";

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

/** Revenue vs expenses bars for the last six months (server-rendered, CSS only). */
export function RevenueChart({ series }: { series: Overview["series"] }) {
  const max = Math.max(1, ...series.flatMap((s) => [s.income, s.expense]));
  const pct = (v: number) => `${Math.max(0, (v / max) * 100).toFixed(1)}%`;
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" aria-hidden /> Revenue
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" aria-hidden /> Expenses
        </span>
      </div>
      <div className="grid h-48 grid-cols-6 items-end gap-3 border-b border-line" role="img" aria-label="Revenue and expenses by month">
        {series.map((s) => (
          <div key={s.month} className="flex h-full items-end justify-center gap-1" title={`${s.month}: revenue ₹${compact.format(s.income)}, expenses ₹${compact.format(s.expense)}`}>
            <div className="w-1/3 max-w-6 rounded-t bg-brand-600" style={{ height: pct(s.income) }} />
            <div className="w-1/3 max-w-6 rounded-t bg-amber-500" style={{ height: pct(s.expense) }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-6 gap-3 text-center text-xs text-ink-soft">
        {series.map((s) => {
          const profit = s.income - s.expense;
          return (
            <div key={s.month}>
              <div className="font-medium text-ink">{s.label}</div>
              <div className={profit < 0 ? "text-red-600" : ""}>{profit < 0 ? `(${compact.format(-profit)})` : compact.format(profit)}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-faint">Second line: profit for the month (₹).</p>
    </div>
  );
}
