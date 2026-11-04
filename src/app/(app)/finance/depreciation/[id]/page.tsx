import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney, num } from "@/lib/format";
import { formatDmy, isoFromDay } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { Note } from "../../_cash_fa/ui";
import { deleteRun, postRun, recalculateRun, reverseRun } from "../actions";

export const metadata: Metadata = { title: "Depreciation run" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function DepreciationRunPage({ params }: PageProps<"/finance/depreciation/[id]">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const { id } = await params;
  const run = await db.depreciationRun.findUnique({
    where: { id },
    include: {
      lines: {
        orderBy: { asset: { code: "asc" } },
        include: { asset: { select: { id: true, code: true, name: true, category: true, method: true, branch: { select: { name: true } } } } },
      },
    },
  });
  if (!run) notFound();
  const canEdit = can(user, "finance", "edit");
  const total = run.lines.reduce((s, l) => s + num(l.amount), 0);
  const reversal = run.transactionNo ? await db.glEntry.findFirst({ where: { reversalOfTx: run.transactionNo }, select: { transactionNo: true, postingDate: true } }) : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {run.number} <StatusBadge status={run.status} />
          </span>
        }
        description={`Depreciation for ${formatDmy(run.periodStart)} – ${formatDmy(run.periodEnd)}`}
        back={{ href: "/finance/depreciation", label: "Depreciation" }}
        actions={
          canEdit && (
            <>
              {run.status === "DRAFT" && (
                <>
                  <ActionButton action={deleteRun.bind(null, id)} variant="ghost" confirmMessage="Delete this draft run?">
                    Delete draft
                  </ActionButton>
                  <ActionButton action={recalculateRun.bind(null, id)} pendingText="Recalculating…">
                    Recalculate
                  </ActionButton>
                  <ActionButton
                    action={postRun.bind(null, id)}
                    variant="primary"
                    pendingText="Posting…"
                    confirmMessage={`Post depreciation dated ${formatDmy(run.periodEnd)}? Amounts are recalculated with the assets as they are now.`}
                  >
                    Post
                  </ActionButton>
                </>
              )}
              {run.status === "POSTED" && (
                <ActionButton
                  action={reverseRun.bind(null, id)}
                  variant="danger"
                  pendingText="Reversing…"
                  confirmMessage="Reverse this run? The assets' depreciation is restored to what it was before."
                  fields={<Input type="date" name="date" defaultValue={isoFromDay(run.periodEnd)} aria-label="Reversal date" className="w-auto" />}
                >
                  Reverse
                </ActionButton>
              )}
            </>
          )
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Depreciation" value={formatMoney(total)} hint={`${run.lines.length} asset${run.lines.length === 1 ? "" : "s"}`} />
        <StatCard label="Posting date" value={formatDmy(run.periodEnd)} hint="Dr Depreciation / Cr Accumulated depreciation" />
        <StatCard
          label="Transaction"
          value={run.transactionNo ?? "—"}
          hint={reversal ? `Reversed by ${reversal.transactionNo} on ${formatDmy(reversal.postingDate)}` : run.status === "DRAFT" ? "Not posted yet" : undefined}
        />
      </div>
      {run.status === "DRAFT" && (
        <div className="mb-4">
          <Note>This is a preview. Posting recalculates every line from the assets&apos; current figures, so a run created earlier stays correct.</Note>
        </div>
      )}
      <Card>
        <CardHeader title="Lines" />
        <Table>
          <THead>
            <tr>
              <TH>Asset</TH>
              <TH>Category</TH>
              <TH>Branch</TH>
              <TH>Method</TH>
              <TH align="right">Opening book value</TH>
              <TH align="right">Depreciation</TH>
              <TH align="right">Closing book value</TH>
            </tr>
          </THead>
          <TBody>
            {run.lines.length === 0 && <EmptyRow colSpan={7}>No lines.</EmptyRow>}
            {run.lines.map((l) => (
              <TR key={l.id}>
                <TD>
                  <Link href={`/finance/fixed-assets/${l.asset.id}`} className="text-brand-700 hover:underline">
                    <span className="font-mono text-xs">{l.asset.code}</span> {l.asset.name}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{l.asset.category}</TD>
                <TD className="text-ink-soft">{l.asset.branch?.name ?? "—"}</TD>
                <TD className="text-ink-soft">{l.asset.method}</TD>
                <TD align="right">{formatMoney(l.openingBookValue)}</TD>
                <TD align="right">{formatMoney(l.amount)}</TD>
                <TD align="right">{formatMoney(num(l.openingBookValue) - num(l.amount))}</TD>
              </TR>
            ))}
            {run.lines.length > 0 && (
              <TR className="font-medium">
                <TD colSpan={5}>Total</TD>
                <TD align="right">{formatMoney(total)}</TD>
                <TD />
              </TR>
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
