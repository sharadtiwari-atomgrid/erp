import "server-only";
import { db } from "@/lib/db";
import { money } from "@/lib/finance/chart";
import { num } from "@/lib/format";
import { formatDmy } from "@/lib/ops/dates";
import type { TaxKind } from "./tds";

export type DeducteeRow = {
  contactId: string;
  name: string;
  pan: string | null;
  gstin: string | null;
  entries: number;
  base: number;
  tax: number;
  deposited: number;
  challans: string[];
};

/** Form 26Q / 27EQ style summary of a quarter: per section, per deductee. */
export async function loadQuarterSummary(kind: TaxKind, quarter: string) {
  const entries = await db.tdsEntry.findMany({
    where: { kind, quarter },
    orderBy: [{ date: "asc" }],
    include: { section: { select: { id: true, code: true, description: true } }, contact: { select: { id: true, name: true, pan: true, gstin: true } } },
  });
  const sections = new Map<string, { code: string; description: string; rows: Map<string, DeducteeRow> }>();
  for (const e of entries) {
    const s = sections.get(e.section.id) ?? { code: e.section.code, description: e.section.description, rows: new Map() };
    const r = s.rows.get(e.contact.id) ?? {
      contactId: e.contact.id,
      name: e.contact.name,
      pan: e.contact.pan,
      gstin: e.contact.gstin,
      entries: 0,
      base: 0,
      tax: 0,
      deposited: 0,
      challans: [],
    };
    r.entries += 1;
    r.base = money(r.base + num(e.baseAmount));
    r.tax = money(r.tax + num(e.amount));
    if (e.status !== "PENDING") r.deposited = money(r.deposited + num(e.amount));
    if (e.challanNo) {
      const label = `${e.challanNo} (${formatDmy(e.challanDate)})`;
      if (!r.challans.includes(label)) r.challans.push(label);
    }
    s.rows.set(e.contact.id, r);
    sections.set(e.section.id, s);
  }
  const list = [...sections.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((s) => {
      const rows = [...s.rows.values()].sort((a, b) => a.name.localeCompare(b.name));
      return {
        code: s.code,
        description: s.description,
        rows,
        total: {
          entries: rows.reduce((t, r) => t + r.entries, 0),
          base: money(rows.reduce((t, r) => t + r.base, 0)),
          tax: money(rows.reduce((t, r) => t + r.tax, 0)),
          deposited: money(rows.reduce((t, r) => t + r.deposited, 0)),
        },
      };
    });
  const statuses = new Set(entries.map((e) => e.status));
  return {
    sections: list,
    grand: {
      base: money(list.reduce((t, s) => t + s.total.base, 0)),
      tax: money(list.reduce((t, s) => t + s.total.tax, 0)),
      deposited: money(list.reduce((t, s) => t + s.total.deposited, 0)),
    },
    missingPan: list.some((s) => s.rows.some((r) => !r.pan)),
    status: entries.length === 0 ? "EMPTY" : statuses.size === 1 && statuses.has("FILED") ? "FILED" : statuses.has("PENDING") ? "PENDING" : "DEPOSITED",
  };
}
