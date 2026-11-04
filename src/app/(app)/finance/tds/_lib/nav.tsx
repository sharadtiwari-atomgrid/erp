import Link from "next/link";
import { cn } from "@/lib/cn";
import type { TaxKind } from "./tds";

/** TDS / TCS switch plus the Entries · Quarterly summary · Sections tabs. */
export function TaxNav({ kind, current, quarter }: { kind: TaxKind; current: "entries" | "summary" | "sections"; quarter?: string }) {
  const q = quarter ? `&quarter=${encodeURIComponent(quarter)}` : "";
  const tabs = [
    { key: "entries", label: "Entries", href: `/finance/tds?kind=${kind}${q}` },
    { key: "summary", label: kind === "TCS" ? "Quarterly summary (27EQ)" : "Quarterly summary (26Q)", href: `/finance/tds/summary?kind=${kind}${q}` },
    { key: "sections", label: "Sections", href: `/finance/tds/sections?kind=${kind}` },
  ] as const;
  const base = current === "entries" ? "/finance/tds" : `/finance/tds/${current}`;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line">
      <nav className="flex gap-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              t.key === current ? "border-brand-600 text-brand-700" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mb-2 inline-flex rounded-md border border-line p-0.5 text-sm">
        {(["TDS", "TCS"] as const).map((k) => (
          <Link
            key={k}
            href={`${base}?kind=${k}${current === "sections" ? "" : q}`}
            className={cn("rounded px-3 py-1 font-medium", k === kind ? "bg-brand-600 text-white" : "text-ink-soft hover:text-ink")}
          >
            {k}
          </Link>
        ))}
      </div>
    </div>
  );
}
