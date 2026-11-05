import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { branchWhere } from "@/lib/branch";
import type { Prisma } from "@/generated/prisma/client";

export const instant = false;

export default async function VendorLedgerPage({ searchParams }: PageProps<"/finance/vendor-ledger">) {
  await requireUser("finance");
  const sp = await searchParams;
  const q = param(sp, "q");
  const supplierId = param(sp, "supplierId");
  const { page, take, skip } = pagination(sp);

  const supplierWhere: Prisma.ContactWhereInput = { roles: { has: "SUPPLIER" } };
  if (q) supplierWhere.OR = [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }];

  const suppliers = await db.contact.findMany({
    where: supplierWhere,
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true },
  });

  const where: Prisma.GlEntryWhereInput = {
    ...(await branchWhere()),
    ...(supplierId ? { contactId: supplierId } : { contact: { roles: { has: "SUPPLIER" } } }),
  };

  const [entries, total] = await Promise.all([
    db.glEntry.findMany({
      where,
      orderBy: [{ postingDate: "desc" }, { entryNo: "desc" }],
      take,
      skip,
      include: { account: { select: { code: true, name: true } }, contact: { select: { id: true, name: true } } },
    }),
    db.glEntry.count({ where }),
  ]);

  return (
    <>
      <PageHeader title="Vendor Ledger Entries" description="Posted supplier transactions and their general-ledger impact." />
      <Card>
        <ListToolbar q={q} placeholder="Search vendor" />
        <div className="border-b border-line px-4 py-3 text-sm text-ink-soft">
          {supplierId ? (
            <span>Vendor: {suppliers.find((s) => s.id === supplierId)?.name ?? supplierId}</span>
          ) : (
            <span>All vendors</span>
          )}
          <span className="ml-4">
            {suppliers.slice(0, 8).map((s) => (
              <Link key={s.id} href={`/finance/vendor-ledger?supplierId=${s.id}`} className="mr-3 text-brand-700 hover:underline">{s.name}</Link>
            ))}
          </span>
        </div>
        <Table>
          <THead><tr><TH>Posting Date</TH><TH>Document</TH><TH>Account</TH><TH>Description</TH><TH align="right">Debit</TH><TH align="right">Credit</TH></tr></THead>
          <TBody>
            {entries.length === 0 && <EmptyRow colSpan={6}>No vendor ledger entries found.</EmptyRow>}
            {entries.map((e) => (
              <TR key={e.id}>
                <TD>{formatDate(e.postingDate)}</TD>
                <TD className="font-medium">{e.documentNo ?? "—"}</TD>
                <TD>{e.account.code} — {e.account.name}</TD>
                <TD className="text-ink-soft">{e.description ?? "—"}</TD>
                <TD align="right">{Number(e.debit) ? formatMoney(e.debit) : "—"}</TD>
                <TD align="right">{Number(e.credit) ? formatMoney(e.credit) : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
