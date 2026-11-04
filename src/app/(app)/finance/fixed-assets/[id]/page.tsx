import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assetCostAccountCode } from "@/lib/finance/assets";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney, formatNumber, num } from "@/lib/format";
import { formatDmy, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { toDepreciable } from "../../_cash_fa/asset-data";
import { METHOD_LABELS } from "../../_cash_fa/constants";
import { projectSchedule } from "../../_cash_fa/depreciation";
import { Note } from "../../_cash_fa/ui";
import { disposeAsset, postAcquisition } from "../actions";
import { AcquisitionForm, DisposalForm } from "./asset-actions";

export const metadata: Metadata = { title: "Fixed asset" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function AssetPage({ params }: PageProps<"/finance/fixed-assets/[id]">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const { id } = await params;
  const asset = await db.fixedAsset.findUnique({
    where: { id },
    include: {
      branch: { select: { name: true } },
      purchaseInvoice: { select: { id: true, number: true, status: true, supplier: { select: { name: true } }, lines: { select: { glAccountId: true, lineTotal: true } } } },
      depreciationLines: { include: { run: { select: { id: true, number: true, periodStart: true, periodEnd: true, status: true } } }, orderBy: { run: { periodEnd: "desc" } } },
    },
  });
  if (!asset) notFound();

  const costCode = assetCostAccountCode(asset.category);
  const [costAccount, entries, accountRows, bankAccounts] = await Promise.all([
    db.glAccount.findUnique({ where: { code: costCode }, select: { id: true, code: true, name: true } }),
    db.glEntry.findMany({
      where: { sourceType: "FixedAsset", sourceId: id },
      orderBy: [{ transactionNo: "asc" }, { entryNo: "asc" }],
      include: { account: { select: { code: true, name: true } } },
    }),
    db.glAccount.findMany({ where: { isGroup: false, isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, type: true, cashFlowGroup: true } }),
    db.bankAccount.findMany({ where: { isActive: true }, select: { glAccountId: true } }),
  ]);
  const acquisitionPosting = entries.find((e) => e.documentType === "Asset acquisition" && !e.reversed);
  const piCapitalised =
    !!asset.purchaseInvoice &&
    ["POSTED", "PARTIALLY_PAID", "PAID"].includes(asset.purchaseInvoice.status) &&
    asset.purchaseInvoice.lines.some((l) => l.glAccountId && l.glAccountId === costAccount?.id);

  const cost = num(asset.cost);
  const accumulated = num(asset.accumulatedDepreciation);
  const bookValue = cost - accumulated;
  const schedule = asset.status === "ACTIVE" ? projectSchedule(toDepreciable(asset)) : [];
  const canEdit = can(user, "finance", "edit") && asset.status === "ACTIVE";
  const today = todayIso();

  const bankGl = new Set(bankAccounts.map((b) => b.glAccountId));
  const label = (a: { code: string; name: string }) => `${a.code} · ${a.name}`;
  // Credit side of an acquisition: bank/cash, liabilities (payables, borrowings) or opening balance equity.
  const creditOptions = accountRows
    .filter((a) => bankGl.has(a.id) || a.cashFlowGroup === "CASH" || a.type === "LIABILITY" || a.code === "3300")
    .map((a) => ({ id: a.id, label: label(a) }));
  // Sale proceeds: bank/cash or a receivable-type current asset.
  const receiveOptions = accountRows
    .filter((a) => bankGl.has(a.id) || a.cashFlowGroup === "CASH" || a.code === "1490")
    .map((a) => ({ id: a.id, label: label(a) }));

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {asset.code} <StatusBadge status={asset.status} />
          </span>
        }
        description={`${asset.name} · ${asset.category}`}
        back={{ href: "/finance/fixed-assets", label: "Asset register" }}
        actions={
          canEdit && (
            <ButtonLink href={`/finance/fixed-assets/${id}/edit`} variant="secondary">
              Edit
            </ButtonLink>
          )
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Cost" value={formatMoney(cost)} hint={costAccount ? `Account ${costAccount.code} ${costAccount.name}` : undefined} />
        <StatCard label="Accumulated depreciation" value={formatMoney(accumulated)} hint={asset.depreciatedTo ? `Charged to ${formatDmy(asset.depreciatedTo)}` : "Not depreciated yet"} />
        <StatCard label="Book value" value={asset.status === "DISPOSED" ? "—" : formatMoney(bookValue)} hint={`Salvage ${formatMoney(asset.salvageValue)}`} />
        <StatCard
          label={asset.status === "DISPOSED" ? "Disposed" : "Acquisition"}
          value={asset.status === "DISPOSED" ? formatDmy(asset.disposalDate) : acquisitionPosting ? "Posted" : piCapitalised ? "Via bill" : "Not posted"}
          hint={
            asset.status === "DISPOSED"
              ? `For ${formatMoney(asset.disposalAmount)}`
              : acquisitionPosting
                ? `Transaction ${acquisitionPosting.transactionNo}`
                : piCapitalised
                  ? asset.purchaseInvoice?.number
                  : undefined
          }
          tone={!acquisitionPosting && !piCapitalised && asset.status === "ACTIVE" ? "warning" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Depreciation schedule" description="Projected by financial year from the next uncharged day, with the current settings." />
            <Table>
              <THead>
                <tr>
                  <TH>Year</TH>
                  <TH>From</TH>
                  <TH align="right">Opening</TH>
                  <TH align="right">Depreciation</TH>
                  <TH align="right">Closing</TH>
                </tr>
              </THead>
              <TBody>
                {schedule.length === 0 && <EmptyRow colSpan={5}>{asset.status === "DISPOSED" ? "The asset is disposed." : "Fully depreciated, or the depreciation settings are incomplete."}</EmptyRow>}
                {schedule.map((r) => (
                  <TR key={r.year}>
                    <TD>{r.year}</TD>
                    <TD className="text-ink-soft">{formatDmy(r.start)}</TD>
                    <TD align="right">{formatMoney(r.opening)}</TD>
                    <TD align="right">{formatMoney(r.depreciation)}</TD>
                    <TD align="right">{formatMoney(r.closing)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Depreciation history" />
            <Table>
              <THead>
                <tr>
                  <TH>Run</TH>
                  <TH>Period</TH>
                  <TH>Status</TH>
                  <TH align="right">Opening book value</TH>
                  <TH align="right">Depreciation</TH>
                </tr>
              </THead>
              <TBody>
                {asset.depreciationLines.length === 0 && <EmptyRow colSpan={5}>No depreciation runs yet.</EmptyRow>}
                {asset.depreciationLines.map((l) => (
                  <TR key={l.id} className={l.run.status !== "POSTED" ? "text-ink-faint" : undefined}>
                    <TD>
                      <Link href={`/finance/depreciation/${l.run.id}`} className="font-mono text-xs text-brand-700 hover:underline">
                        {l.run.number}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {formatDmy(l.run.periodStart)} – {formatDmy(l.run.periodEnd)}
                    </TD>
                    <TD>
                      <StatusBadge status={l.run.status} />
                    </TD>
                    <TD align="right">{formatMoney(l.openingBookValue)}</TD>
                    <TD align="right">{formatMoney(l.amount)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Ledger postings" description="Acquisition and disposal entries for this asset." />
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH>Account</TH>
                  <TH align="right">Debit</TH>
                  <TH align="right">Credit</TH>
                </tr>
              </THead>
              <TBody>
                {entries.length === 0 && <EmptyRow colSpan={5}>Nothing posted for this asset.</EmptyRow>}
                {entries.map((e) => (
                  <TR key={e.id} className={e.reversed ? "text-ink-faint" : undefined}>
                    <TD className="whitespace-nowrap">{formatDmy(e.postingDate)}</TD>
                    <TD className="text-xs">
                      {e.documentType} <span className="text-ink-faint">· Tx {e.transactionNo}</span>
                    </TD>
                    <TD>
                      <span className="font-mono text-xs">{e.account.code}</span> {e.account.name}
                    </TD>
                    <TD align="right">{num(e.debit) ? formatMoney(e.debit) : ""}</TD>
                    <TD align="right">{num(e.credit) ? formatMoney(e.credit) : ""}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  { label: "Category", value: asset.category },
                  { label: "Branch", value: asset.branch?.name },
                  { label: "Location", value: asset.location },
                  { label: "Acquisition date", value: formatDmy(asset.acquisitionDate) },
                  { label: "Method", value: METHOD_LABELS[asset.method] ?? asset.method },
                  {
                    label: asset.method === "WDV" ? "Rate" : "Useful life",
                    value: asset.method === "WDV" ? `${formatNumber(asset.ratePct)}% a year` : `${formatNumber(asset.usefulLifeYears)} years`,
                  },
                  {
                    label: "Purchase invoice",
                    value: asset.purchaseInvoice ? (
                      <Link href={`/finance/purchase-invoices/${asset.purchaseInvoice.id}`} className="text-brand-700 hover:underline">
                        {asset.purchaseInvoice.number} · {asset.purchaseInvoice.supplier.name}
                      </Link>
                    ) : null,
                  },
                  { label: "Notes", value: asset.notes },
                ]}
              />
            </CardBody>
          </Card>

          {canEdit && !acquisitionPosting && (
            <Card>
              <CardHeader
                title="Acquisition"
                description={
                  piCapitalised
                    ? "The linked purchase invoice already posted a line to the asset's cost account, so no acquisition posting is needed."
                    : `Not bought through a purchase invoice posted to ${costCode}? Post Dr ${costCode} / Cr the account it was paid from.`
                }
              />
              {!piCapitalised && <AcquisitionForm action={postAcquisition.bind(null, id)} accounts={creditOptions} defaultDate={isoDate(asset.acquisitionDate)} />}
              {piCapitalised && asset.purchaseInvoice && (
                <CardBody>
                  <Note>
                    Capitalised through {asset.purchaseInvoice.number} ({formatMoney(asset.purchaseInvoice.lines.filter((l) => l.glAccountId === costAccount?.id).reduce((s, l) => s + num(l.lineTotal), 0))} to {costCode}).
                  </Note>
                </CardBody>
              )}
            </Card>
          )}

          {canEdit && (
            <Card>
              <CardHeader title="Dispose" description="Sell or scrap the asset." />
              <DisposalForm action={disposeAsset.bind(null, id)} accounts={receiveOptions} defaultDate={today} bookValue={bookValue} />
            </Card>
          )}

          {asset.status === "DISPOSED" && (
            <Card>
              <CardHeader title="Disposal" />
              <CardBody>
                <DetailList
                  items={[
                    { label: "Date", value: formatDmy(asset.disposalDate) },
                    { label: "Sale amount", value: formatMoney(asset.disposalAmount) },
                    { label: "Book value at disposal", value: formatMoney(cost - accumulated) },
                    { label: "Profit / (loss)", value: formatMoney(num(asset.disposalAmount) - (cost - accumulated)) },
                  ]}
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
