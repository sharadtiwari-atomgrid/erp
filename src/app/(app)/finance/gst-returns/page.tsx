import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { GstReturn } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { recentPeriods, type TaxSplit } from "@/lib/finance/gst";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney, formatNumber } from "@/lib/format";
import { param } from "@/lib/forms";
import { formatDmy, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { amt } from "../reports/_lib/amount";
import { markGstReturnFiled, reopenGstReturn } from "./actions";
import { MarkFiledForm } from "./filed-form";
import { keyFigures, loadGstReturns, resolvePeriod, type GstData } from "./_lib/load";

export const metadata: Metadata = { title: "GST returns" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periodLabel = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

function TaxCells({ t }: { t: TaxSplit & { taxable?: number } }) {
  return (
    <>
      {t.taxable !== undefined && <TD align="right">{amt(t.taxable, { zero: "0.00" })}</TD>}
      <TD align="right">{amt(t.igst, { zero: "0.00" })}</TD>
      <TD align="right">{amt(t.cgst, { zero: "0.00" })}</TD>
      <TD align="right">{amt(t.sgst, { zero: "0.00" })}</TD>
    </>
  );
}

function TaxHeads({ taxable = true }: { taxable?: boolean }) {
  return (
    <>
      {taxable && <TH align="right">Taxable value</TH>}
      <TH align="right">IGST</TH>
      <TH align="right">CGST</TH>
      <TH align="right">SGST</TH>
    </>
  );
}

function Section({ title, description, children, count }: { title: string; description?: string; children: ReactNode; count?: number }) {
  return (
    <Card className="mt-6">
      <CardHeader title={count === undefined ? title : `${title} (${count})`} description={description} />
      {children}
    </Card>
  );
}

function FilingStatus({
  type,
  period,
  filing,
  data,
  canEdit,
}: {
  type: "GSTR-1" | "GSTR-3B";
  period: string;
  filing: GstReturn | null;
  data: GstData;
  canEdit: boolean;
}) {
  const filed = filing?.status === "Filed";
  const snap = (filing?.snapshot ?? null) as Record<string, unknown> | null;
  const now = keyFigures(data, type);
  let changed = false;
  if (filed && snap) {
    const before = type === "GSTR-1" ? (snap.totals as Record<string, number> | undefined) : { ...(snap.outward as Record<string, number>), netPayable: snap.netPayable as number };
    changed = !!before && Object.entries(now).some(([k, v]) => Math.abs((before[k] ?? 0) - v) > 0.005);
  }
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {type} filing status {filed ? <Badge tone="green">Filed</Badge> : <Badge tone="amber">Not filed</Badge>}
          </span>
        }
        description={
          filed
            ? `ARN ${filing?.arn ?? "—"} · filed on ${formatDmy(filing?.filedOn)}${filing?.notes ? ` · ${filing.notes}` : ""}`
            : "File on the GST portal, then record the ARN here. The figures below are saved as filed."
        }
        actions={
          filed && canEdit ? (
            <ActionButton action={reopenGstReturn.bind(null, type, period)} size="sm" confirmMessage={`Set ${type} for ${period} back to not filed?`}>
              Undo filed
            </ActionButton>
          ) : null
        }
      />
      {changed && (
        <CardBody>
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            The figures have changed since this return was marked as filed (documents were posted or cancelled in {periodLabel(period)}
            afterwards). Report the difference in a later return.
          </p>
        </CardBody>
      )}
      {!filed && canEdit && (
        <CardBody>
          <MarkFiledForm action={markGstReturnFiled} type={type} period={period} today={todayIso()} />
        </CardBody>
      )}
    </Card>
  );
}

function Gstr1View({ data }: { data: GstData }) {
  const g = data.gstr1;
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Invoices" value={formatNumber(g.totals.invoices)} />
        <StatCard label="Taxable value" value={formatMoney(g.totals.taxable)} />
        <StatCard label="IGST" value={formatMoney(g.totals.igst)} />
        <StatCard label="CGST" value={formatMoney(g.totals.cgst)} />
        <StatCard label="SGST" value={formatMoney(g.totals.sgst)} />
      </div>

      <Section title="4A · B2B invoices" description="Supplies to registered customers (with a GSTIN), invoice-wise." count={g.b2b.length}>
        <Table>
          <THead>
            <tr>
              <TH>GSTIN</TH>
              <TH>Customer</TH>
              <TH>Invoice</TH>
              <TH>Date</TH>
              <TH align="right">Invoice value</TH>
              <TH>Place of supply</TH>
              <TaxHeads />
            </tr>
          </THead>
          <TBody>
            {g.b2b.length === 0 && <EmptyRow colSpan={10} />}
            {g.b2b.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.gstin}</TD>
                <TD>{r.customerName}</TD>
                <TD>
                  <Link href={`/sales/invoices/${r.id}`} className="text-brand-700 hover:underline">
                    {r.number}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{formatDmy(r.date)}</TD>
                <TD align="right">{amt(r.value)}</TD>
                <TD className="text-ink-soft">{r.posCode ? `${r.posCode}-${r.placeOfSupply}` : r.placeOfSupply || "—"}</TD>
                <TaxCells t={r} />
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section title="5A · B2C (large) invoices" description="Inter-state invoices above ₹2.5 lakh to unregistered customers." count={g.b2cl.length}>
        <Table>
          <THead>
            <tr>
              <TH>Invoice</TH>
              <TH>Date</TH>
              <TH>Customer</TH>
              <TH align="right">Invoice value</TH>
              <TH>Place of supply</TH>
              <TaxHeads />
            </tr>
          </THead>
          <TBody>
            {g.b2cl.length === 0 && <EmptyRow colSpan={9} />}
            {g.b2cl.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={`/sales/invoices/${r.id}`} className="text-brand-700 hover:underline">
                    {r.number}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{formatDmy(r.date)}</TD>
                <TD>{r.customerName}</TD>
                <TD align="right">{amt(r.value)}</TD>
                <TD className="text-ink-soft">{r.posCode ? `${r.posCode}-${r.placeOfSupply}` : r.placeOfSupply || "—"}</TD>
                <TaxCells t={r} />
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section title="7 · B2C (small) supplies" description="All other supplies to unregistered customers, by place of supply and rate." count={g.b2cs.length}>
        <Table>
          <THead>
            <tr>
              <TH>Place of supply</TH>
              <TH>Type</TH>
              <TH align="right">Rate</TH>
              <TaxHeads />
            </tr>
          </THead>
          <TBody>
            {g.b2cs.length === 0 && <EmptyRow colSpan={7} />}
            {g.b2cs.map((r) => (
              <TR key={`${r.posCode}-${r.rate}-${r.interState}`}>
                <TD>{r.posCode ? `${r.posCode}-${r.placeOfSupply}` : r.placeOfSupply || "—"}</TD>
                <TD className="text-ink-soft">{r.interState ? "Inter-state" : "Intra-state"}</TD>
                <TD align="right">{r.rate}%</TD>
                <TaxCells t={r} />
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section title="12 · HSN-wise summary" description="From invoice lines and the products' HSN codes." count={g.hsn.length}>
        <Table>
          <THead>
            <tr>
              <TH>HSN</TH>
              <TH>Description</TH>
              <TH>UQC</TH>
              <TH align="right">Quantity</TH>
              <TH align="right">Rate</TH>
              <TH align="right">Total value</TH>
              <TaxHeads />
            </tr>
          </THead>
          <TBody>
            {g.hsn.length === 0 && <EmptyRow colSpan={10} />}
            {g.hsn.map((r) => (
              <TR key={`${r.hsn}-${r.uqc}-${r.rate}`}>
                <TD className={cn("font-mono text-xs", r.hsn === "NA" && "text-red-600")}>{r.hsn === "NA" ? "Missing" : r.hsn}</TD>
                <TD className="max-w-64 truncate text-ink-soft">{r.description}</TD>
                <TD>{r.uqc}</TD>
                <TD align="right">{formatNumber(r.quantity)}</TD>
                <TD align="right">{r.rate}%</TD>
                <TD align="right">{amt(r.value)}</TD>
                <TaxCells t={r} />
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section title="13 · Documents issued" description="Invoice number series used in the month, including cancelled invoices.">
        <Table>
          <THead>
            <tr>
              <TH>Series</TH>
              <TH>From</TH>
              <TH>To</TH>
              <TH align="right">Total</TH>
              <TH align="right">Cancelled</TH>
              <TH align="right">Net issued</TH>
            </tr>
          </THead>
          <TBody>
            {g.docs.length === 0 && <EmptyRow colSpan={6} />}
            {g.docs.map((d) => (
              <TR key={d.series}>
                <TD className="font-mono text-xs">{d.series || "—"}</TD>
                <TD>{d.from}</TD>
                <TD>{d.to}</TD>
                <TD align="right">{d.total}</TD>
                <TD align="right">{d.cancelled}</TD>
                <TD align="right">{d.net}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
    </>
  );
}

function Gstr3bView({ data }: { data: GstData }) {
  const g = data.gstr3b;
  const s = g.setOff;
  const heads: Array<keyof TaxSplit> = ["igst", "cgst", "sgst"];
  const headLabel = { igst: "IGST", cgst: "CGST", sgst: "SGST" };
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Output tax" value={formatMoney(g.outward.igst + g.outward.cgst + g.outward.sgst)} />
        <StatCard label="Input tax credit" value={formatMoney(g.itc.igst + g.itc.cgst + g.itc.sgst)} />
        <StatCard label="Net payable in cash" value={formatMoney(g.netPayable)} tone={g.netPayable > 0 ? "warning" : "default"} />
        <StatCard label="Credit carried forward" value={formatMoney(s.carryForward.igst + s.carryForward.cgst + s.carryForward.sgst)} />
      </div>

      <Section title="3.1 · Outward supplies">
        <Table>
          <THead>
            <tr>
              <TH>Nature of supplies</TH>
              <TaxHeads />
            </tr>
          </THead>
          <TBody>
            <TR>
              <TD>(a) Outward taxable supplies (other than zero rated, nil rated and exempted)</TD>
              <TaxCells t={g.outward} />
            </TR>
            <TR>
              <TD>(c) Other outward supplies (nil rated, exempted)</TD>
              <TaxCells t={{ taxable: g.nilRated, igst: 0, cgst: 0, sgst: 0 }} />
            </TR>
          </TBody>
        </Table>
      </Section>

      <Section title="4 · Eligible ITC" description="From posted purchase invoices dated in the month.">
        <Table>
          <THead>
            <tr>
              <TH>Details</TH>
              <TaxHeads taxable={false} />
            </tr>
          </THead>
          <TBody>
            <TR>
              <TD>(A)(5) All other ITC</TD>
              <TaxCells t={g.itc} />
            </TR>
            <TR>
              <TD className="text-ink-soft">(D) Ineligible ITC (bills marked not eligible)</TD>
              <TaxCells t={g.ineligible} />
            </TR>
            <TR className="font-semibold">
              <TD>(C) Net ITC available</TD>
              <TaxCells t={g.itc} />
            </TR>
          </TBody>
        </Table>
      </Section>

      <Section title="6.1 · Payment of tax" description="Output tax less ITC per head. IGST credit is used first, then CGST and SGST credit (CGST and SGST never cross).">
        <Table>
          <THead>
            <tr>
              <TH>Tax head</TH>
              <TH align="right">Tax payable</TH>
              <TH align="right">Paid by IGST credit</TH>
              <TH align="right">Paid by CGST credit</TH>
              <TH align="right">Paid by SGST credit</TH>
              <TH align="right">Payable in cash</TH>
              <TH align="right">Credit left</TH>
            </tr>
          </THead>
          <TBody>
            {heads.map((h) => (
              <TR key={h}>
                <TD className="font-medium">{headLabel[h]}</TD>
                <TD align="right">{amt(s.liability[h], { zero: "0.00" })}</TD>
                <TD align="right">{amt(s.utilised.igst[h], { zero: "0.00" })}</TD>
                <TD align="right">{amt(s.utilised.cgst[h], { zero: "0.00" })}</TD>
                <TD align="right">{amt(s.utilised.sgst[h], { zero: "0.00" })}</TD>
                <TD align="right" className="font-semibold">
                  {amt(s.cash[h], { zero: "0.00" })}
                </TD>
                <TD align="right">{amt(s.carryForward[h], { zero: "0.00" })}</TD>
              </TR>
            ))}
            <TR className="bg-muted/40 font-semibold">
              <TD>Total</TD>
              <TD align="right">{amt(s.liability.igst + s.liability.cgst + s.liability.sgst, { zero: "0.00" })}</TD>
              <TD colSpan={3} />
              <TD align="right">{amt(g.netPayable, { zero: "0.00" })}</TD>
              <TD align="right">{amt(s.carryForward.igst + s.carryForward.cgst + s.carryForward.sgst, { zero: "0.00" })}</TD>
            </TR>
          </TBody>
        </Table>
      </Section>

      <Section title="ITC register" description="Eligible purchase invoices included in 4(A)." count={g.itcRows.length}>
        <Table>
          <THead>
            <tr>
              <TH>Bill</TH>
              <TH>Supplier invoice</TH>
              <TH>Supplier</TH>
              <TH>GSTIN</TH>
              <TH>Date</TH>
              <TaxHeads />
            </tr>
          </THead>
          <TBody>
            {g.itcRows.length === 0 && <EmptyRow colSpan={9} />}
            {g.itcRows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={`/finance/purchase-invoices/${r.id}`} className="text-brand-700 hover:underline">
                    {r.number}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{r.supplierInvoiceNo ?? "—"}</TD>
                <TD>{r.supplierName}</TD>
                <TD className="font-mono text-xs">{r.supplierGstin ?? <span className="text-amber-700">No GSTIN</span>}</TD>
                <TD className="text-ink-soft">{formatDmy(r.date)}</TD>
                <TaxCells t={r} />
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
    </>
  );
}

export default async function FinanceGstReturnsPage({ searchParams }: PageProps<"/finance/gst-returns">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const period = resolvePeriod(param(sp, "period"));
  const tab = param(sp, "tab") === "gstr3b" ? "gstr3b" : "gstr1";
  const data = await loadGstReturns(period);
  const canEdit = can(user, "finance", "edit");
  const periods = recentPeriods(todayIso(), 24);
  if (!periods.includes(period)) periods.push(period);
  const type = tab === "gstr1" ? "GSTR-1" : "GSTR-3B";

  return (
    <>
      <PageHeader
        title="GST returns"
        description={`${periodLabel(period)} · ${data.company.name || "Company"}${data.company.gstin ? ` · GSTIN ${data.company.gstin}` : " · set the GSTIN in company settings"}`}
        back={{ href: "/finance", label: "Finance" }}
        actions={
          <>
            <form className="flex items-center gap-2">
              <input type="hidden" name="tab" value={tab} />
              <Select name="period" defaultValue={period} aria-label="Return period" className="w-36">
                {periods.map((p) => (
                  <option key={p} value={p}>
                    {periodLabel(p)}
                  </option>
                ))}
              </Select>
              <button type="submit" className={buttonClass("secondary")}>
                Show
              </button>
            </form>
            <ButtonLink variant="secondary" href={`/finance/gst-returns/export?period=${period}&type=${tab}`} prefetch={false}>
              Export {type} to Excel
            </ButtonLink>
            {tab === "gstr1" && (
              <ButtonLink variant="secondary" href={`/finance/gst-returns/json?period=${period}`} prefetch={false}>
                GSTR-1 JSON
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="mb-4 rounded-md border border-line bg-muted/40 px-4 py-3 text-sm text-ink-soft">
        <strong className="text-ink">For review only.</strong> These figures are prepared from issued sales invoices and posted purchase
        invoices. The ERP does not file returns with the GSTN directly: file on the GST portal (the GSTR-1 JSON is for review and upload
        through the GST offline tool), then record the ARN here.
      </div>

      <nav className="mb-4 flex gap-1 border-b border-line">
        {(["gstr1", "gstr3b"] as const).map((t) => (
          <Link
            key={t}
            href={`/finance/gst-returns?period=${period}&tab=${t}`}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              t === tab ? "border-brand-600 text-brand-700" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t === "gstr1" ? "GSTR-1 · outward supplies" : "GSTR-3B · summary"}
            {(t === "gstr1" ? data.filings.gstr1 : data.filings.gstr3b)?.status === "Filed" && <span className="ml-1.5 text-emerald-600">✓</span>}
          </Link>
        ))}
      </nav>

      <FilingStatus type={type} period={period} filing={tab === "gstr1" ? data.filings.gstr1 : data.filings.gstr3b} data={data} canEdit={canEdit} />
      {tab === "gstr1" ? <Gstr1View data={data} /> : <Gstr3bView data={data} />}
    </>
  );
}
