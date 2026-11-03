import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { ReturnStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatDate, formatMoney, humanize } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { OpsBadge } from "../logistics/_components/badges";
import { enumParam } from "../sales/_lib/documents";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Returns" };

export default async function ReturnsPage({ searchParams }: PageProps<"/returns">) {
  const user = await requireUser("returns");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = enumParam(ReturnStatus, param(sp, "status"));
  const { page, take, skip } = pagination(sp);

  const where: Prisma.ReturnOrderWhereInput = {
    ...(await branchWhere()),
    ...(status && { status }),
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { invoice: { is: { number: { contains: q, mode: "insensitive" } } } },
        { salesOrder: { is: { number: { contains: q, mode: "insensitive" } } } },
      ],
    }),
  };

  const [returns, total] = await Promise.all([
    db.returnOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        customer: { select: { id: true, name: true } },
        invoice: { select: { id: true, number: true } },
        salesOrder: { select: { id: true, number: true } },
        warehouse: { select: { name: true } },
        lines: { select: { disposition: true, repairedAt: true } },
      },
    }),
    db.returnOrder.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Returns"
        description="Customer returns (RMA): receive, inspect, restock, repair or scrap, and credit."
        actions={can(user, "returns", "edit") && <ButtonLink href="/returns/new">New return</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search number, customer, invoice, order"
          filter={{
            name: "status",
            value: status ?? "",
            allLabel: "All statuses",
            options: Object.values(ReturnStatus).map((s) => ({ value: s, label: humanize(s) })),
          }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Number</TH>
              <TH>Customer</TH>
              <TH>Against</TH>
              <TH>Warehouse</TH>
              <TH>Requested</TH>
              <TH align="right">Credit</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {returns.length === 0 && <EmptyRow colSpan={7} />}
            {returns.map((r) => {
              const repairs = r.lines.filter((l) => l.disposition === "REPAIR" && !l.repairedAt).length;
              return (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/returns/${r.id}`} className="font-medium text-brand-700 hover:underline">
                      {r.number}
                    </Link>
                  </TD>
                  <TD>
                    <Link href={`/contacts/${r.customer.id}`} className="hover:underline">
                      {r.customer.name}
                    </Link>
                  </TD>
                  <TD className="text-ink-soft">
                    {r.invoice ? (
                      <Link href={`/sales/invoices/${r.invoice.id}`} className="hover:underline">
                        {r.invoice.number}
                      </Link>
                    ) : r.salesOrder ? (
                      <Link href={`/sales/orders/${r.salesOrder.id}`} className="hover:underline">
                        {r.salesOrder.number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-ink-soft">{r.warehouse.name}</TD>
                  <TD className="text-ink-soft">{formatDate(r.requestedAt)}</TD>
                  <TD align="right">{formatMoney(r.creditAmount)}</TD>
                  <TD>
                    <span className="flex gap-1.5">
                      <OpsBadge status={r.status} />
                      {repairs > 0 && <OpsBadge status="REPAIR" label={`${repairs} in repair`} />}
                    </span>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
