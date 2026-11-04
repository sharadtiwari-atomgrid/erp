import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { formatDmy } from "@/lib/ops/dates";
import { cn } from "@/lib/cn";
import { AGING_BUCKETS, type AgedParty, type Buckets } from "./aging";
import type { AdvanceRow } from "./server";
import { Amount } from "./ui";

/** As-of date picker (GET form) with an Excel export link. */
export function AsOfToolbar({ asOf, exportHref, children }: { asOf: string; exportHref: string; children?: ReactNode }) {
  return (
    <form className="flex flex-wrap items-end gap-2 border-b border-line px-4 py-3">
      <label className="text-sm text-ink">
        <span className="mb-1 block text-xs font-medium text-ink-soft">As on</span>
        <Input type="date" name="asOf" defaultValue={asOf} className="w-44" />
      </label>
      {children}
      <button type="submit" className={buttonClass("secondary")}>
        Apply
      </button>
      <a href={exportHref} className={cn(buttonClass("secondary"), "ml-auto")}>
        Export to Excel
      </a>
    </form>
  );
}

/**
 * Aging summary: one row per party with bucket columns, a grand total, and
 * the selected party expanded into its documents.
 */
export function AgingTable({
  parties,
  totals,
  total,
  partyLabel,
  selected,
  partyHref,
  docHref,
}: {
  parties: AgedParty[];
  totals: Buckets;
  total: number;
  partyLabel: string;
  selected: string;
  /** Link that toggles a party's drill-down. */
  partyHref: (partyId: string | null) => string;
  docHref: (docId: string) => string;
}) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>{partyLabel}</TH>
          {AGING_BUCKETS.map((b) => (
            <TH key={b.key} align="right">
              {b.label}
            </TH>
          ))}
          <TH align="right">Total</TH>
        </tr>
      </THead>
      <TBody>
        {parties.length === 0 && <EmptyRow colSpan={7}>Nothing outstanding on this date.</EmptyRow>}
        {parties.map((p) => {
          const open = p.partyId === selected;
          return (
            <Fragment key={p.partyId}>
              <TR className={open ? "bg-muted/40" : undefined}>
                <TD>
                  <Link href={partyHref(open ? null : p.partyId)} className="font-medium text-brand-700 hover:underline" scroll={false}>
                    <span aria-hidden className="mr-1 inline-block w-3 text-ink-soft">
                      {open ? "▾" : "▸"}
                    </span>
                    {p.partyName}
                  </Link>
                  <span className="ml-2 text-xs text-ink-faint">
                    {p.docs.length} doc{p.docs.length === 1 ? "" : "s"}
                  </span>
                </TD>
                {AGING_BUCKETS.map((b) => (
                  <TD key={b.key} align="right" className={b.key === "d90plus" && p.buckets[b.key] > 0 ? "text-red-600" : undefined}>
                    <Amount value={p.buckets[b.key]} dashZero />
                  </TD>
                ))}
                <TD align="right" className="font-semibold">
                  <Amount value={p.total} />
                </TD>
              </TR>
              {open &&
                p.docs.map((d) => (
                  <tr key={d.id} className="bg-muted/20 text-xs">
                    <td className="py-1.5 pl-12 pr-4 text-ink-soft">
                      <Link href={docHref(d.id)} className="text-brand-700 hover:underline">
                        {d.number}
                      </Link>{" "}
                      · {formatDmy(d.docDate)} · due {formatDmy(d.dueDate || d.docDate)}
                      {d.daysOverdue > 0 && <span className="ml-1 text-red-600">({d.daysOverdue} days overdue)</span>}
                    </td>
                    {AGING_BUCKETS.map((b) => (
                      <td key={b.key} className="px-4 py-1.5 text-right tabular-nums text-ink">
                        {d.bucket === b.key ? <Amount value={d.balance} /> : null}
                      </td>
                    ))}
                    <td className="px-4 py-1.5 text-right tabular-nums text-ink-soft">of {formatMoney(d.total)}</td>
                  </tr>
                ))}
            </Fragment>
          );
        })}
        {parties.length > 0 && (
          <TR className="bg-muted/60 font-semibold">
            <TD>Total</TD>
            {AGING_BUCKETS.map((b) => (
              <TD key={b.key} align="right">
                <Amount value={totals[b.key]} />
              </TD>
            ))}
            <TD align="right">
              <Amount value={total} />
            </TD>
          </TR>
        )}
      </TBody>
    </Table>
  );
}

/** Unapplied receipts / payments (advances), listed separately from the aging. */
export function AdvancesCard({ title, description, rows, partyLabel }: { title: string; description: string; rows: AdvanceRow[]; partyLabel: string }) {
  const total = rows.reduce((s, r) => s + r.unapplied, 0);
  return (
    <Card>
      <CardHeader title={title} description={description} actions={<span className="text-sm font-semibold tabular-nums text-ink">{formatMoney(total)}</span>} />
      <Table>
        <THead>
          <tr>
            <TH>Document</TH>
            <TH>Date</TH>
            <TH>{partyLabel}</TH>
            <TH align="right">Amount</TH>
            <TH align="right">Unapplied</TH>
          </tr>
        </THead>
        <TBody>
          {rows.length === 0 && <EmptyRow colSpan={5}>No unapplied amounts.</EmptyRow>}
          {rows.map((r) => (
            <TR key={r.id}>
              <TD>
                <Link href={r.href} className="font-medium text-brand-700 hover:underline">
                  {r.number}
                </Link>
              </TD>
              <TD className="text-ink-soft">{formatDmy(r.date)}</TD>
              <TD>{r.partyName}</TD>
              <TD align="right">{formatMoney(r.amount)}</TD>
              <TD align="right">{formatMoney(r.unapplied)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

/** Excel rows for an aging report: summary sheet, document sheet, advances sheet. */
export function agingSheets(
  result: { parties: AgedParty[]; totals: Buckets; total: number },
  advances: AdvanceRow[],
  partyLabel: string,
  docLabel: string,
) {
  const summary = result.parties.map((p) => ({
    [partyLabel]: p.partyName,
    ...Object.fromEntries(AGING_BUCKETS.map((b) => [b.label, p.buckets[b.key]])),
    Total: p.total,
  }));
  if (summary.length) summary.push({ [partyLabel]: "Total", ...Object.fromEntries(AGING_BUCKETS.map((b) => [b.label, result.totals[b.key]])), Total: result.total });
  const docs = result.parties.flatMap((p) =>
    p.docs.map((d) => ({
      [partyLabel]: p.partyName,
      [docLabel]: d.number,
      Date: formatDmy(d.docDate),
      "Due date": formatDmy(d.dueDate || d.docDate),
      "Days overdue": Math.max(0, d.daysOverdue),
      Bucket: AGING_BUCKETS.find((b) => b.key === d.bucket)?.label ?? "",
      Total: d.total,
      Balance: d.balance,
    })),
  );
  const adv = advances.map((a) => ({ Document: a.number, Date: formatDmy(a.date), [partyLabel]: a.partyName, Amount: a.amount, Unapplied: a.unapplied }));
  return { summary, docs, adv };
}
