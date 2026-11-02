import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { addDays } from "@/lib/format";
import { param } from "@/lib/forms";
import { toIstDateTimeInput } from "../../../books/_lib/eway";
import { createShippingDocument } from "../actions";
import { ShippingDocumentForm } from "../document-forms";

export const metadata: Metadata = { title: "New shipping document" };

export default async function NewShippingDocumentPage({ searchParams }: PageProps<"/logistics/documents/new">) {
  await requireUser("trips", "edit");
  const sp = await searchParams;
  const type = param(sp, "type") === "DN" ? "DN" : "ASN";
  const outboundId = param(sp, "outboundId");

  const outbounds = await db.outboundOrder.findMany({
    where: { ...(await branchWhere()), status: { in: ["PACKED", "DISPATCHED"] } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      number: true,
      status: true,
      trip: { select: { number: true } },
      salesOrder: { select: { number: true, customer: { select: { name: true } } } },
    },
  });

  return (
    <div className="max-w-3xl">
      <PageHeader title="New ASN / delivery note" back={{ href: "/logistics/documents", label: "ASN & delivery notes" }} />
      <ShippingDocumentForm
        action={createShippingDocument}
        cancelHref="/logistics/documents"
        defaults={{ type, outboundId, expectedDelivery: toIstDateTimeInput(addDays(new Date(), 1)) }}
        outbounds={outbounds.map((o) => ({
          id: o.id,
          label: `${o.number} · ${o.salesOrder.customer.name} · ${o.salesOrder.number}${o.trip ? ` · ${o.trip.number}` : ""} (${o.status.toLowerCase()})`,
        }))}
      />
    </div>
  );
}
