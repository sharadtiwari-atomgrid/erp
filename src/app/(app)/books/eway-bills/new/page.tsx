import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { param } from "@/lib/forms";
import { getCompany, getTransporterOptions } from "@/lib/options";
import { getVehicleOptions } from "../../../logistics/_lib/scope";
import { PortalNote } from "../../_components/portal-note";
import { toIstDateTimeInput } from "../../_lib/eway";
import { createEwayBill } from "../actions";
import { EwayBillForm } from "../eway-form";

export const metadata: Metadata = { title: "Record e-way bill" };

export default async function NewEwayBillPage({ searchParams }: PageProps<"/books/eway-bills/new">) {
  await requireUser("eWayBills", "edit");
  const invoiceId = param(await searchParams, "invoiceId");

  const [invoices, vehicles, transporters, company] = await Promise.all([
    db.invoice.findMany({
      where: { ...(await branchWhere()), status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] } },
      orderBy: { issueDate: "desc" },
      take: 300,
      select: {
        id: true,
        number: true,
        total: true,
        placeOfSupply: true,
        customer: { select: { name: true, city: true, state: true } },
        outbound: { select: { trip: { select: { vehicleId: true } } } },
      },
    }),
    getVehicleOptions({ excludeInactive: true }),
    getTransporterOptions(),
    getCompany(),
  ]);
  const selected = invoices.find((i) => i.id === invoiceId);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Record e-way bill"
        back={selected ? { href: `/sales/invoices/${selected.id}`, label: selected.number } : { href: "/books/eway-bills", label: "E-way bills" }}
      />
      <PortalNote />
      <EwayBillForm
        action={createEwayBill}
        cancelHref={selected ? `/sales/invoices/${selected.id}` : "/books/eway-bills"}
        invoices={invoices.map((i) => ({
          id: i.id,
          label: `${i.number} · ${i.customer.name} · ${formatMoney(i.total)}`,
          toPlace: i.customer.city ?? i.placeOfSupply ?? i.customer.state ?? "",
        }))}
        vehicles={vehicles}
        transporters={transporters}
        defaults={{
          invoiceId: selected?.id ?? "",
          fromPlace: company.city ?? company.state ?? "",
          generatedAt: toIstDateTimeInput(new Date()),
          vehicleId: selected?.outbound?.trip?.vehicleId ?? "",
        }}
      />
    </div>
  );
}
