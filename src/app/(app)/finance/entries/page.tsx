import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { num } from "@/lib/format";
import { param } from "@/lib/forms";
import { formatDmy } from "@/lib/ops/dates";
import { sourceHref } from "../_gl/ledger";
import { getBranchOptions, getDimensionOptions, paymentInvoiceMap } from "../_gl/server";
import { Amount, FilterField, dimensionText } from "../_gl/ui";
import { entryInclude, entryWhere, readEntryFilter } from "./filter";

export const metadata: Metadata = { title: "General Ledger Entries" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

const PAGE = 50;

export default async function FinanceEntriesPage({ searchParams }: PageProps<"/finance/entries">) {
  await requireUser("finance", "view");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const filter = readEntryFilter((k) => param(sp, k), Object.keys(sp));
  const page = Math.max(1, Number.parseInt(param(sp, "page"), 10) || 1);
  const where = await entryWhere(filter);

  const [entries, agg, accounts, docTypes, branches, dimensions] = await Promise.all([
    db.glEntry.findMany({ where, orderBy: [{ postingDate: "desc" }, { entryNo: "desc" }], take: PAGE, skip: (page - 1) * PAGE, include: entryInclude }),
    db.glEntry.aggregate({ where, _sum: { debit: true, credit: true }, _count: true }),
    db.glAccount.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true, isGroup: true } }),
    db.glEntry.findMany({ distinct: ["documentType"], select: { documentType: true }, orderBy: { documentType: "asc" } }),
    getBranchOptions(),
    getDimensionOptions(),
  ]);
  const payments = await paymentInvoiceMap(entries.filter((e) => e.sourceType === "Payment" && e.sourceId).map((e) => e.sourceId!));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (k !== "page" && typeof v === "string" && v) qs.set(k, v);

  return (
    <>
      <PageHeader
        title="General Ledger Entries"
        description={filter.transactionNo ? `Transaction ${filter.transactionNo}` : "Every line posted to the general ledger."}
        actions={
          <a href={`/finance/entries/export?${qs.toString()}`} className={buttonClass("secondary")}>
            Export to Excel
          </a>
        }
      />
      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3" role="search">
          <FilterField label="From">
            <Input type="date" name="from" defaultValue={filter.from} className="w-40" />
          </FilterField>
          <FilterField label="To">
            <Input type="date" name="to" defaultValue={filter.to} className="w-40" />
          </FilterField>
          <FilterField label="Account">
            <Select name="account" defaultValue={filter.account} className="w-56">
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                  {a.isGroup ? " (heading)" : ""}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Document Type">
            <Select name="docType" defaultValue={filter.docType} className="w-40">
              <option value="">All types</option>
              {docTypes.map((d) => (
                <option key={d.documentType} value={d.documentType}>
                  {d.documentType}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Document No.">
            <Input name="docNo" defaultValue={filter.docNo} className="w-32" />
          </FilterField>
          <FilterField label="Contact">
            <Input name="contact" defaultValue={filter.contact} placeholder="Name" className="w-36" />
          </FilterField>
          <FilterField label="Branch">
            <Select name="branch" defaultValue={filter.branch} className="w-36">
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FilterField>
          {dimensions.map((d) => (
            <FilterField key={d.code} label={d.name}>
              <Select name={`dim_${d.code}`} defaultValue={filter.dims[d.code] ?? ""} className="w-36">
                <option value="">Any</option>
                {d.values.map((v) => (
                  <option key={v.code} value={v.code}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </FilterField>
          ))}
          <FilterField label="Transaction no.">
            <Input name="transactionNo" inputMode="numeric" defaultValue={filter.transactionNo} className="w-28" />
          </FilterField>
          <button type="submit" className={buttonClass("secondary")}>
            Apply
          </button>
          <Link href="/finance/entries" className={buttonClass("ghost")}>
            Clear
          </Link>
        </form>
        <Table>
          <THead>
            <tr>
              <TH>Entry</TH>
              <TH>Posting Date</TH>
              <TH>Document No.</TH>
              <TH>Account</TH>
              <TH>Description</TH>
              <TH align="right">Debit Amount</TH>
              <TH align="right">Credit Amount</TH>
              <TH>Contact</TH>
              <TH>Dimensions</TH>
            </tr>
          </THead>
          <TBody>
            {entries.length === 0 && <EmptyRow colSpan={9}>No entries match.</EmptyRow>}
            {entries.map((e) => {
              const href = sourceHref(e.sourceType, e.sourceId, payments);
              return (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap tabular-nums text-ink-soft">
                    {e.entryNo}
                    <Link href={`/finance/entries?transactionNo=${e.transactionNo}`} className="block text-xs hover:underline" title="All lines of this transaction">
                      Tx {e.transactionNo}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap">{formatDmy(e.postingDate)}</TD>
                  <TD className="whitespace-nowrap">
                    <span className="block text-xs text-ink-soft">{e.documentType}</span>
                    {href ? (
                      <Link href={href} className="text-brand-700 hover:underline">
                        {e.documentNo ?? "View"}
                      </Link>
                    ) : (
                      (e.documentNo ?? "—")
                    )}
                    {e.reversed && (
                      <span className="ml-1.5">
                        <Badge tone="amber">{e.reversalOfTx ? "Reversal" : "Reversed"}</Badge>
                      </span>
                    )}
                  </TD>
                  <TD>
                    <Link href={`/finance/accounts/${e.account.id}`} className="hover:underline">
                      <span className="tabular-nums text-ink-soft">{e.account.code}</span> {e.account.name}
                    </Link>
                  </TD>
                  <TD className="max-w-xs text-ink-soft">{e.description ?? "—"}</TD>
                  <TD align="right">{num(e.debit) ? <Amount value={num(e.debit)} /> : ""}</TD>
                  <TD align="right">{num(e.credit) ? <Amount value={num(e.credit)} /> : ""}</TD>
                  <TD>
                    {e.contact ? (
                      <Link href={`/contacts/${e.contact.id}`} className="hover:underline">
                        {e.contact.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-xs text-ink-soft">
                    {[e.branchId ? branchName.get(e.branchId) : null, dimensionText(e.dimensions)].filter(Boolean).join(" · ") || "—"}
                  </TD>
                </TR>
              );
            })}
          </TBody>
          {agg._count > 0 && (
            <tfoot className="border-t border-line bg-muted/40 text-sm font-semibold">
              <tr>
                <TD colSpan={5}>Total ({agg._count} entries)</TD>
                <TD align="right">
                  <Amount value={num(agg._sum.debit)} />
                </TD>
                <TD align="right">
                  <Amount value={num(agg._sum.credit)} />
                </TD>
                <TD colSpan={2} className="text-xs font-normal text-ink-soft">
                  Net <Amount value={num(agg._sum.debit) - num(agg._sum.credit)} /> Dr
                </TD>
              </tr>
            </tfoot>
          )}
        </Table>
        <Pagination page={page} pageSize={PAGE} total={agg._count} searchParams={sp} />
      </Card>
    </>
  );
}
