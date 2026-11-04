"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/form";
import { convert } from "../_gl/ledger";

/** Converts an amount between currencies using the latest rates (rupees per unit; INR = 1). */
export function Converter({ rates }: { rates: Array<{ code: string; rate: number | null }> }) {
  const usable = rates.filter((r) => r.rate);
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState(usable.find((r) => r.code !== "INR")?.code ?? "INR");
  const [to, setTo] = useState("INR");
  const rateOf = (c: string) => usable.find((r) => r.code === c)?.rate ?? 0;
  const result = convert(Number(amount) || 0, rateOf(from), rateOf(to));

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
      <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" className="w-32 text-right tabular-nums" />
      <Select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From currency" className="w-24">
        {usable.map((r) => (
          <option key={r.code}>{r.code}</option>
        ))}
      </Select>
      <span className="text-ink-soft">=</span>
      <span className="min-w-32 text-right text-lg font-semibold tabular-nums">
        {result.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
      </span>
      <Select value={to} onChange={(e) => setTo(e.target.value)} aria-label="To currency" className="w-24">
        {usable.map((r) => (
          <option key={r.code}>{r.code}</option>
        ))}
      </Select>
      <button
        type="button"
        onClick={() => {
          setFrom(to);
          setTo(from);
        }}
        className="text-xs text-brand-700 hover:underline"
      >
        Swap
      </button>
    </div>
  );
}
