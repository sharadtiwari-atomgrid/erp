import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/format";
import { getBranchOptions, getTransporterOptions } from "@/lib/options";
import { updateDriver } from "../../actions";
import { DriverForm } from "../../driver-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Edit driver" };

export default async function EditDriverPage({ params }: PageProps<"/logistics/drivers/[id]/edit">) {
  await requireUser("fleet", "edit");
  const { id } = await params;
  const driver = await db.driver.findUnique({ where: { id } });
  if (!driver) notFound();
  const [branches, transporters] = await Promise.all([getBranchOptions(driver.branchId), getTransporterOptions(driver.transporterId)]);

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${driver.name}`} back={{ href: `/logistics/drivers/${id}`, label: driver.name }} />
      <DriverForm
        action={updateDriver.bind(null, id)}
        branches={branches}
        transporters={transporters}
        cancelHref={`/logistics/drivers/${id}`}
        initial={{ ...driver, licenseUntil: toDateInput(driver.licenseUntil) }}
      />
    </div>
  );
}
