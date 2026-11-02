import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { OpsBadge } from "../../logistics/_components/badges";
import { ewayDisplayStatus } from "../_lib/eway";

/** "E-way bills" card for the invoice detail page. Renders nothing for users without e-way bill access. */
export async function InvoiceEwayBillsCard({ invoiceId, invoiceStatus, user }: { invoiceId: string; invoiceStatus: string; user: CurrentUser }) {
  if (!can(user, "eWayBills")) return null;
  const bills = await db.eWayBill.findMany({
    where: { invoiceId },
    orderBy: { generatedAt: "desc" },
    include: { vehicle: { select: { registrationNo: true } } },
  });
  const canAdd = can(user, "eWayBills", "edit") && ["ISSUED", "PARTIALLY_PAID", "PAID"].includes(invoiceStatus);
  const now = new Date();

  return (
    <Card>
      <CardHeader
        title="E-way bills"
        description="Generated on ewaybillgst.gov.in and recorded here."
        actions={
          canAdd && (
            <ButtonLink href={`/books/eway-bills/new?invoiceId=${invoiceId}`} variant="secondary" size="sm">
              Add e-way bill
            </ButtonLink>
          )
        }
      />
      <ul className="divide-y divide-line">
        {bills.length === 0 && (
          <li className="px-5 py-6 text-center text-sm text-ink-faint">
            {invoiceStatus === "DRAFT" ? "Issue the invoice to record an e-way bill." : "No e-way bills recorded."}
          </li>
        )}
        {bills.map((b) => (
          <li key={b.id} className="flex items-start justify-between gap-3 px-5 py-3">
            <div>
              <Link href={`/books/eway-bills/${b.id}`} className="font-mono text-sm font-medium text-brand-700 hover:underline">
                {b.number}
              </Link>
              <p className="text-xs text-ink-faint">
                {b.vehicle?.registrationNo ?? b.vehicleNo ?? "—"} · {b.distanceKm} km · valid until {formatDateTime(b.validUntil)}
              </p>
            </div>
            <OpsBadge status={ewayDisplayStatus(b, now)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
