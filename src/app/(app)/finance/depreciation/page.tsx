import Link from "next/link";
import type { Metadata } from "next";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney } from "@/lib/format";
import { formatDmy, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { createRun } from "./actions";

export const metadata: Metadata = { title: "Calculate Depreciation" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function DepreciationPage() {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const runs = await db.depreciationRun.findMany({ orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }], take: 100, include: { _count: { select: { lines: true } } } });
  const activeAssets = await db.fixedAsset.count({ where: { status: "ACTIVE" } });

  return (
    <>
      <PageHeader title="Calculate Depreciation" description="Calculate and post depreciation for active fixed assets, by month, quarter or financial year." />
      {can(user, "finance", "edit") && (
        <Card className="mb-6">
          <CardHeader
            title="New Depreciation Run"
            description={`Each of the ${activeAssets} active assets is charged from the day after it was last depreciated (or its acquisition date) to the end of the period, pro rata by days. You can review the lines before posting.`}
          />
          <CardBody>
            <ActionButton
              action={createRun}
              variant="primary"
              pendingText="Calculating…"
              fields={
                <>
                  <Select name="kind" defaultValue="month" aria-label="Period" className="w-auto">
                    <option value="month">Month</option>
                    <option value="quarter">Quarter (financial year)</option>
                    <option value="year">Financial year</option>
                  </Select>
                  <Input type="date" name="anchor" defaultValue={todayIso()} aria-label="Any date in the period" className="w-auto" />
                </>
              }
            >
              Calculate
            </ActionButton>
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title="Runs" />
        <Table>
          <THead>
            <tr>
              <TH>Run</TH>
              <TH>Period</TH>
              <TH align="right">Assets</TH>
              <TH align="right">Depreciation</TH>
              <TH>Transaction</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {runs.length === 0 && <EmptyRow colSpan={6}>No depreciation runs yet.</EmptyRow>}
            {runs.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={`/finance/depreciation/${r.id}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                    {r.number}
                  </Link>
                </TD>
                <TD className="whitespace-nowrap">
                  {formatDmy(r.periodStart)} – {formatDmy(r.periodEnd)}
                </TD>
                <TD align="right">{r._count.lines}</TD>
                <TD align="right">{formatMoney(r.total)}</TD>
                <TD className="text-ink-soft">{r.transactionNo ?? "—"}</TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
