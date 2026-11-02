import Link from "next/link";
import type { Metadata } from "next";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { OpsBadge } from "../../logistics/_components/badges";
import { PortalNote } from "../_components/portal-note";
import { canCancelEwb, ewayDisplayStatus } from "../_lib/eway";
import { cancelEwayBill } from "./actions";

export const metadata: Metadata = { title: "E-way bills" };

export default async function EwayBillsPage({ searchParams }: PageProps<"/books/eway-bills">) {
  const user = await requireUser("eWayBills");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const { page, take, skip } = pagination(sp);
  const now = new Date();
  const canEdit = can(user, "eWayBills", "edit");

  const where: Prisma.EWayBillWhereInput = {
    invoice: await branchWhere(),
    // ACTIVE/EXPIRED are derived from validUntil; the stored status stays ACTIVE.
    ...(status === "ACTIVE" && { status: "ACTIVE", validUntil: { gte: now } }),
    ...(status === "EXPIRED" && { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", validUntil: { lt: now } }] }),
    ...(status === "CANCELLED" && { status: "CANCELLED" }),
    ...(q && {
      AND: [
        {
          OR: [
            { number: { contains: q.replace(/\s/g, "") } },
            { invoice: { number: { contains: q, mode: "insensitive" } } },
            { invoice: { customer: { name: { contains: q, mode: "insensitive" } } } },
            { vehicleNo: { contains: q.replace(/\s/g, ""), mode: "insensitive" } },
            { vehicle: { is: { registrationNo: { contains: q.replace(/\s/g, ""), mode: "insensitive" } } } },
          ],
        },
      ],
    }),
  };

  const [bills, total] = await Promise.all([
    db.eWayBill.findMany({
      where,
      orderBy: { generatedAt: "desc" },
      take,
      skip,
      include: {
        invoice: { select: { id: true, number: true, customer: { select: { name: true } } } },
        vehicle: { select: { id: true, registrationNo: true } },
        transporter: { select: { name: true } },
      },
    }),
    db.eWayBill.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="E-way bills"
        description="E-way bills recorded against invoices, with validity worked out from the distance."
        actions={canEdit && <ButtonLink href="/books/eway-bills/new">Record e-way bill</ButtonLink>}
      />
      <PortalNote />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search EWB no., invoice, customer, vehicle"
          filter={{
            name: "status",
            value: status,
            allLabel: "All statuses",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "EXPIRED", label: "Expired" },
              { value: "CANCELLED", label: "Cancelled" },
            ],
          }}
        />
        <Table>
          <THead>
            <tr>
              <TH>EWB no.</TH>
              <TH>Invoice</TH>
              <TH>Route</TH>
              <TH>Vehicle</TH>
              <TH>Generated</TH>
              <TH>Valid until</TH>
              <TH>Status</TH>
              {canEdit && <TH />}
            </tr>
          </THead>
          <TBody>
            {bills.length === 0 && <EmptyRow colSpan={canEdit ? 8 : 7} />}
            {bills.map((b) => (
              <TR key={b.id}>
                <TD>
                  <Link href={`/books/eway-bills/${b.id}`} className="font-mono font-medium text-brand-700 hover:underline">
                    {b.number}
                  </Link>
                </TD>
                <TD>
                  <Link href={`/sales/invoices/${b.invoice.id}`} className="hover:underline">
                    {b.invoice.number}
                  </Link>
                  <div className="text-xs text-ink-faint">{b.invoice.customer.name}</div>
                </TD>
                <TD>
                  {b.fromPlace} → {b.toPlace}
                  <div className="text-xs text-ink-faint">{b.distanceKm} km</div>
                </TD>
                <TD className="font-mono text-xs">
                  {b.vehicle?.registrationNo ?? b.vehicleNo ?? "—"}
                  {b.transporter && <div className="font-sans text-ink-faint">{b.transporter.name}</div>}
                </TD>
                <TD className="text-ink-soft">{formatDateTime(b.generatedAt)}</TD>
                <TD className="text-ink-soft">{formatDateTime(b.validUntil)}</TD>
                <TD>
                  <OpsBadge status={ewayDisplayStatus(b, now)} />
                </TD>
                {canEdit && (
                  <TD align="right">
                    {canCancelEwb(b, now) && (
                      <ActionButton action={cancelEwayBill.bind(null, b.id)} size="sm" variant="ghost" confirmMessage={`Cancel e-way bill ${b.number}? Cancel it on the GST portal too.`}>
                        Cancel
                      </ActionButton>
                    )}
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
