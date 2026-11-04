import type { StatementLine } from "@/lib/finance/reports";

/** Flattens statement lines to spreadsheet rows (headings, lines, accounts, totals). */
export function statementAoa(title: string[], columns: string[], lines: StatementLine[]): unknown[][] {
  const out: unknown[][] = [...title.map((t) => [t]), [], ["Particulars", "Account", ...columns]];
  for (const l of lines) {
    if (l.kind === "heading") {
      out.push([l.label]);
      continue;
    }
    out.push([l.label, "", ...l.amounts.map((v) => Math.round(v * 100) / 100)]);
    for (const a of l.accounts) out.push(["", a.code ? `${a.code} ${a.name}` : a.name, ...a.amounts.map((v) => Math.round(v * 100) / 100)]);
  }
  return out;
}
