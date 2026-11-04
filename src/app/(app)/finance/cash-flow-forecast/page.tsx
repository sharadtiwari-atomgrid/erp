import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { openPayables, openReceivables } from "@/lib/finance/queries";
import { formatMoney, num } from "@/lib/format";
import { param } from "@/lib/forms";
import { formatDmy, isoFromDay, todayIso } from "@/lib/ops/dates";
import { cn } from "@/lib/cn";
import { buildForecast, monthBuckets, weekBuckets, type ForecastItem, type ForecastRow, type ForecastSource } from "../_cash_fa/forecast";
import { glBalances } from "../_cash_fa/server";
import { Amount, Note, TabLinks } from "../_cash_fa/ui";

export const metadata: Metadata = { title: "Cash flow forecast" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

type Detail = ForecastItem & { label: string; party: string; href: string };

const SOURCE_LABELS: Record<ForecastSource, string> = {
  receivables: "Open receivables",
  salesOrders: "Sales orders not invoiced",
  payables: "Open payables",
  purchaseOrders: "Purchase orders not billed",
};

async function loadItems(): Promise<Detail[]> {
  const [receivables, payables, salesOrders, purchaseOrders] = await Promise.all([
    openReceivables(),
    openPayables(),
    db.salesOrder.findMany({
      where: { status: { in: ["CONFIRMED", "PARTIALLY_DELIVERED", "DELIVERED"] } },
      select: { id: true, number: true, orderDate: true, expectedDate: true, total: true, customer: { select: { name: true } }, invoices: { where: { status: { notIn: ["DRAFT", "CANCELLED"] } }, select: { total: true } } },
    }),
    db.purchaseOrder.findMany({
      where: { status: { in: ["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED"] } },
      select: { id: true, number: true, orderDate: true, expectedDate: true, total: true, supplier: { select: { name: true } }, purchaseInvoices: { where: { status: { notIn: ["DRAFT", "CANCELLED"] } }, select: { total: true } } },
    }),
  ]);
  const items: Detail[] = [];
  for (const r of receivables) {
    items.push({ source: "receivables", date: isoFromDay(r.dueDate ?? r.issueDate), amount: r.balance, label: r.number, party: r.customer.name, href: `/sales/invoices/${r.id}` });
  }
  for (const p of payables) {
    items.push({ source: "payables", date: isoFromDay(p.dueDate ?? p.invoiceDate), amount: p.balance, label: p.supplierInvoiceNo ? `${p.number} (${p.supplierInvoiceNo})` : p.number, party: p.supplier.name, href: `/finance/purchase-invoices/${p.id}` });
  }
  for (const so of salesOrders) {
    const left = num(so.total) - so.invoices.reduce((s, i) => s + num(i.total), 0);
    if (left > 0.004) items.push({ source: "salesOrders", date: isoFromDay(so.expectedDate ?? so.orderDate), amount: left, label: so.number, party: so.customer.name, href: `/sales/orders/${so.id}` });
  }
  for (const po of purchaseOrders) {
    const left = num(po.total) - po.purchaseInvoices.reduce((s, i) => s + num(i.total), 0);
    if (left > 0.004) items.push({ source: "purchaseOrders", date: isoFromDay(po.expectedDate ?? po.orderDate), amount: left, label: po.number, party: po.supplier.name, href: `/purchasing/orders/${po.id}` });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export default async function CashFlowForecastPage({ searchParams }: PageProps<"/finance/cash-flow-forecast">) {
  await requireUser("finance");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const view = param(sp, "view") === "month" ? "month" : "week";
  const today = todayIso();

  const cashAccounts = await db.glAccount.findMany({ where: { cashFlowGroup: "CASH", isGroup: false }, select: { id: true } });
  const [balances, items] = await Promise.all([glBalances(cashAccounts.map((a) => a.id)), loadItems()]);
  const opening = [...balances.values()].reduce((s, v) => s + v, 0);
  const buckets = view === "month" ? monthBuckets(today, 3) : weekBuckets(today, 12);
  const { rows, laterIn, laterOut } = buildForecast(opening, items, buckets);
  const horizonEnd = buckets.at(-1)!.end;
  const totalIn = rows.reduce((s, r) => s + r.inflow, 0);
  const totalOut = rows.reduce((s, r) => s + r.outflow, 0);
  const lowest = rows.reduce((m, r) => (r.closing < m.closing ? r : m), rows[0]);
  const negatives = rows.filter((r) => r.negative);
  const overdueIn = items.filter((i) => i.date < today && (i.source === "receivables" || i.source === "salesOrders")).reduce((s, i) => s + i.amount, 0);
  const overdueOut = items.filter((i) => i.date < today && (i.source === "payables" || i.source === "purchaseOrders")).reduce((s, i) => s + i.amount, 0);
  const details = items.filter((i) => i.date <= horizonEnd);

  return (
    <>
      <PageHeader
        title="Cash flow forecast"
        description={`Expected cash in and out from ${formatDmy(today)} to ${formatDmy(horizonEnd)}, starting from today's bank and cash balances.`}
        actions={
          <TabLinks
            tabs={[
              { href: "/finance/cash-flow-forecast", label: "12 weeks", active: view === "week" },
              { href: "/finance/cash-flow-forecast?view=month", label: "3 months", active: view === "month" },
            ]}
          />
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Opening cash" value={<Amount value={opening} />} hint="All bank and cash accounts" tone={opening < 0 ? "danger" : "default"} />
        <StatCard label="Expected inflows" value={formatMoney(totalIn)} hint={overdueIn > 0 ? `Includes ${formatMoney(overdueIn)} overdue` : undefined} />
        <StatCard label="Expected outflows" value={formatMoney(totalOut)} hint={overdueOut > 0 ? `Includes ${formatMoney(overdueOut)} overdue` : undefined} />
        <StatCard
          label="Lowest closing balance"
          value={<Amount value={lowest.closing} />}
          hint={lowest.label}
          tone={lowest.closing < 0 ? "danger" : "default"}
        />
      </div>
      {negatives.length > 0 && (
        <div className="mb-6">
          <Note tone="warning">
            Cash goes negative in {negatives.length} {view === "week" ? "week" : "month"}
            {negatives.length === 1 ? "" : "s"}, first in {negatives[0].label} ({formatMoney(negatives[0].closing)}). Consider chasing receivables or rescheduling payments.
          </Note>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader title="Closing balance" description="Bars below the line are negative. Hover a bar for its figures." />
        <div className="px-5 py-4">
          <BalanceChart rows={rows} />
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Forecast" description="Overdue items are placed in the first column." />
        <Table>
          <THead>
            <tr>
              <TH className="sticky left-0 bg-muted">&nbsp;</TH>
              {rows.map((r) => (
                <TH key={r.start} align="right" className={r.negative ? "text-red-600" : undefined}>
                  {r.label}
                </TH>
              ))}
            </tr>
          </THead>
          <TBody>
            <Line label="Opening balance" rows={rows} pick={(r) => r.opening} strong />
            <Line label={SOURCE_LABELS.receivables} rows={rows} pick={(r) => r.receivables} />
            <Line label={SOURCE_LABELS.salesOrders} rows={rows} pick={(r) => r.salesOrders} />
            <Line label="Total inflows" rows={rows} pick={(r) => r.inflow} strong />
            <Line label={SOURCE_LABELS.payables} rows={rows} pick={(r) => -r.payables} />
            <Line label={SOURCE_LABELS.purchaseOrders} rows={rows} pick={(r) => -r.purchaseOrders} />
            <Line label="Total outflows" rows={rows} pick={(r) => -r.outflow} strong />
            <Line label="Net cash flow" rows={rows} pick={(r) => r.net} />
            <Line label="Closing balance" rows={rows} pick={(r) => r.closing} strong />
          </TBody>
        </Table>
        {(laterIn > 0 || laterOut > 0) && (
          <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">
            After {formatDmy(horizonEnd)}: {formatMoney(laterIn)} expected in and {formatMoney(laterOut)} expected out (not shown).
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Items in this forecast" description="Receivables and payables by due date; open orders by expected date." />
        <Table>
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>Type</TH>
              <TH>Document</TH>
              <TH>Party</TH>
              <TH align="right">In</TH>
              <TH align="right">Out</TH>
            </tr>
          </THead>
          <TBody>
            {details.length === 0 && <EmptyRow colSpan={6}>No open receivables, payables or orders.</EmptyRow>}
            {details.slice(0, 200).map((d) => {
              const inflow = d.source === "receivables" || d.source === "salesOrders";
              return (
                <TR key={`${d.source}-${d.href}`}>
                  <TD className={cn("whitespace-nowrap", d.date < today && "text-red-600")}>
                    {formatDmy(d.date)}
                    {d.date < today && <span className="ml-1 text-xs">overdue</span>}
                  </TD>
                  <TD className="text-ink-soft">{SOURCE_LABELS[d.source]}</TD>
                  <TD>
                    <Link href={d.href} className="font-mono text-xs text-brand-700 hover:underline">
                      {d.label}
                    </Link>
                  </TD>
                  <TD>{d.party}</TD>
                  <TD align="right">{inflow ? formatMoney(d.amount) : ""}</TD>
                  <TD align="right">{inflow ? "" : formatMoney(d.amount)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        {details.length > 200 && <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">Showing the first 200 of {details.length} items.</p>}
      </Card>
    </>
  );
}

function Line({ label, rows, pick, strong }: { label: string; rows: ForecastRow[]; pick: (r: ForecastRow) => number; strong?: boolean }) {
  return (
    <TR className={strong ? "font-medium" : undefined}>
      <TD className="sticky left-0 whitespace-nowrap bg-surface">{label}</TD>
      {rows.map((r) => (
        <TD key={r.start} align="right" className="whitespace-nowrap">
          <Amount value={pick(r)} blankZero={!strong} />
        </TD>
      ))}
    </TR>
  );
}

/** Closing balance per bucket as bars around a zero line (plain SVG, theme colours). */
function BalanceChart({ rows }: { rows: ForecastRow[] }) {
  const W = 960;
  const H = 240;
  const padL = 8;
  const padR = 8;
  const top = 16;
  const bottom = 36;
  const values = rows.map((r) => r.closing);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const plotH = H - top - bottom;
  const y = (v: number) => top + ((max - v) / span) * plotH;
  const zero = y(0);
  const slot = (W - padL - padR) / rows.length;
  const barW = Math.min(44, slot * 0.6);
  const compact = (n: number) => {
    const a = Math.abs(n);
    const s = a >= 1e7 ? `${(a / 1e7).toFixed(1)} Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(1)} L` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}k` : a.toFixed(0);
    return n < 0 ? `−${s}` : s;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Closing cash balance by period">
      <line x1={padL} x2={W - padR} y1={zero} y2={zero} className="stroke-line" strokeWidth={1} />
      {rows.map((r, i) => {
        const cx = padL + slot * i + slot / 2;
        const yTop = Math.min(y(r.closing), zero);
        const h = Math.max(1, Math.abs(y(r.closing) - zero));
        return (
          <g key={r.start}>
            <title>{`${r.label}\nOpening ${formatMoney(r.opening)}\nIn ${formatMoney(r.inflow)} · Out ${formatMoney(r.outflow)}\nClosing ${formatMoney(r.closing)}${r.negative ? " (negative)" : ""}`}</title>
            <rect x={cx - slot / 2} y={top} width={slot} height={plotH} fill="transparent" />
            <rect x={cx - barW / 2} y={yTop} width={barW} height={h} rx={4} className={r.negative ? "fill-red-500" : "fill-brand-500"} />
            <text x={cx} y={r.closing >= 0 ? yTop - 4 : yTop + h + 12} textAnchor="middle" className="fill-ink-soft text-[11px] tabular-nums">
              {compact(r.closing)}
            </text>
            <text x={cx} y={H - 18} textAnchor="middle" className={r.negative ? "fill-red-600 text-[11px] font-medium" : "fill-ink-faint text-[11px]"}>
              {r.label.split(" · ")[0]}
            </text>
            {r.negative && (
              <text x={cx} y={H - 4} textAnchor="middle" className="fill-red-600 text-[10px]">
                negative
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
