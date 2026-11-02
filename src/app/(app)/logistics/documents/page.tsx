import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { getBranchScope } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { OpsBadge } from "../_components/badges";

export const metadata: Metadata = { title: "ASN & delivery notes" };

export default async function ShippingDocumentsPage({ searchParams }: PageProps<"/logistics/documents">) {
  const user = await requireUser("trips");
  const sp = await searchParams;
  const q = param(sp, "q");
  const type = param(sp, "type");
  const status = param(sp, "status");
  const { page, take, skip } = pagination(sp);
  const { branchId } = await getBranchScope();

  const where: Prisma.ShippingDocumentWhereInput = {
    AND: [
      // Documents have no branch of their own: scope through the outbound or trip.
      branchId ? { OR: [{ outbound: { is: { branchId } } }, { trip: { is: { branchId } } }] } : {},
      type === "ASN" || type === "DN" ? { type } : {},
      status === "DELIVERED" ? { deliveredAt: { not: null } } : status === "PENDING" ? { type: "DN", deliveredAt: null } : {},
      q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { customer: { is: { name: { contains: q, mode: "insensitive" } } } },
              { outbound: { is: { number: { contains: q, mode: "insensitive" } } } },
              { trip: { is: { number: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {},
    ],
  };

  const [docs, total] = await Promise.all([
    db.shippingDocument.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      take,
      skip,
      include: {
        customer: { select: { id: true, name: true } },
        outbound: { select: { id: true, number: true } },
        trip: { select: { id: true, number: true } },
      },
    }),
    db.shippingDocument.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="ASN & delivery notes"
        description="Advance shipping notices sent at dispatch and delivery notes signed on delivery."
        actions={can(user, "trips", "edit") && <ButtonLink href="/logistics/documents/new">New document</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search number, customer, outbound, trip"
          filter={{
            name: "type",
            value: type,
            allLabel: "ASNs and delivery notes",
            options: [
              { value: "ASN", label: "ASN" },
              { value: "DN", label: "Delivery notes" },
            ],
          }}
        >
          <Select name="status" defaultValue={status} className="w-auto" aria-label="Delivery status">
            <option value="">Any delivery status</option>
            <option value="PENDING">Awaiting delivery</option>
            <option value="DELIVERED">Delivered</option>
          </Select>
        </ListToolbar>
        <Table>
          <THead>
            <tr>
              <TH>Number</TH>
              <TH>Type</TH>
              <TH>Customer</TH>
              <TH>Outbound</TH>
              <TH>Trip</TH>
              <TH>Issued</TH>
              <TH>Expected</TH>
              <TH>Delivered</TH>
            </tr>
          </THead>
          <TBody>
            {docs.length === 0 && <EmptyRow colSpan={8} />}
            {docs.map((d) => (
              <TR key={d.id}>
                <TD>
                  <Link href={`/logistics/documents/${d.id}`} className="font-medium text-brand-700 hover:underline">
                    {d.number}
                  </Link>
                </TD>
                <TD>
                  <OpsBadge status={d.type} />
                </TD>
                <TD>{d.customer ? <Link href={`/contacts/${d.customer.id}`} className="hover:underline">{d.customer.name}</Link> : "—"}</TD>
                <TD>{d.outbound ? <Link href={`/warehouse/outbound/${d.outbound.id}`} className="hover:underline">{d.outbound.number}</Link> : "—"}</TD>
                <TD>{d.trip ? <Link href={`/logistics/trips/${d.trip.id}`} className="hover:underline">{d.trip.number}</Link> : "—"}</TD>
                <TD className="text-ink-soft">{formatDate(d.issuedAt)}</TD>
                <TD className="text-ink-soft">{formatDate(d.expectedDelivery)}</TD>
                <TD>
                  {d.deliveredAt ? (
                    <span className="text-xs">
                      {formatDateTime(d.deliveredAt)}
                      <span className="block text-ink-faint">{d.receivedBy}</span>
                    </span>
                  ) : d.type === "DN" ? (
                    <OpsBadge status="PENDING" label="Awaiting" />
                  ) : (
                    "—"
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
