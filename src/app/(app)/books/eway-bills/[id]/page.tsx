import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import { OpsBadge } from "../../../logistics/_components/badges";
import { ActivityCard } from "../../../sales/_components/activity-card";
import { PortalNote } from "../../_components/portal-note";
import { canCancelEwb, ewayDisplayStatus, ewayValidityDays } from "../../_lib/eway";
import { cancelEwayBill } from "../actions";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "E-way bill" };

export default async function EwayBillPage({ params }: PageProps<"/books/eway-bills/[id]">) {
  const user = await requireUser("eWayBills");
  const { id } = await params;
  const bill = await db.eWayBill.findUnique({
    where: { id },
    include: {
      invoice: { select: { id: true, number: true, total: true, issueDate: true, customer: { select: { id: true, name: true, gstin: true } } } },
      vehicle: { select: { id: true, registrationNo: true, type: true } },
      transporter: { select: { id: true, name: true, gstin: true } },
    },
  });
  if (!bill) notFound();

  const now = new Date();
  const status = ewayDisplayStatus(bill, now);
  const hoursLeft = Math.max(0, Math.floor((bill.generatedAt.getTime() + 24 * 3600_000 - now.getTime()) / 3600_000));

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{bill.number}</span> <OpsBadge status={status} />
          </span>
        }
        description={`${bill.fromPlace} → ${bill.toPlace}`}
        back={{ href: "/books/eway-bills", label: "E-way bills" }}
        actions={
          can(user, "eWayBills", "edit") &&
          canCancelEwb(bill, now) && (
            <ActionButton
              action={cancelEwayBill.bind(null, id)}
              variant="danger"
              pendingText="Cancelling…"
              confirmMessage="Cancel this e-way bill? Cancel it on the GST portal too."
              fields={<Input name="reason" placeholder="Reason (e.g. data entry mistake)" className="w-64" aria-label="Cancellation reason" />}
            >
              Cancel e-way bill
            </ActionButton>
          )
        }
      />
      <PortalNote />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Distance" value={`${bill.distanceKm} km`} hint={`${ewayValidityDays(bill.distanceKm)} day validity`} />
        <StatCard label="Valid until" value={formatDateTime(bill.validUntil)} tone={status === "EXPIRED" ? "danger" : "default"} hint="Midnight of the last day" />
        <StatCard
          label="Cancellable"
          value={canCancelEwb(bill, now) ? `${hoursLeft} h left` : "No"}
          hint="Within 24 hours of generation"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Details" />
          <CardBody>
            <DetailList
              items={[
                {
                  label: "Invoice",
                  value: (
                    <Link href={`/sales/invoices/${bill.invoice.id}`} className="text-brand-700 hover:underline">
                      {bill.invoice.number} · {formatMoney(bill.invoice.total)}
                    </Link>
                  ),
                },
                {
                  label: "Customer",
                  value: (
                    <Link href={`/contacts/${bill.invoice.customer.id}`} className="text-brand-700 hover:underline">
                      {bill.invoice.customer.name}
                    </Link>
                  ),
                },
                { label: "Customer GSTIN", value: bill.invoice.customer.gstin },
                { label: "Generated", value: formatDateTime(bill.generatedAt) },
                {
                  label: "Vehicle",
                  value: bill.vehicle ? (
                    <Link href={`/logistics/vehicles/${bill.vehicle.id}`} className="font-mono text-brand-700 hover:underline">
                      {bill.vehicle.registrationNo}
                    </Link>
                  ) : (
                    bill.vehicleNo
                  ),
                },
                {
                  label: "Transporter",
                  value: bill.transporter && `${bill.transporter.name}${bill.transporter.gstin ? ` (${bill.transporter.gstin})` : ""}`,
                },
                { label: "From", value: bill.fromPlace },
                { label: "To", value: bill.toPlace },
                { label: "Notes", value: bill.notes },
              ]}
            />
          </CardBody>
        </Card>
        <div className="lg:col-span-1">
          <ActivityCard entityType="EWayBill" entityId={id} />
        </div>
      </div>
    </>
  );
}
