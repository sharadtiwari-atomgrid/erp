import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getBranchOptions, getTransporterOptions } from "@/lib/options";
import { createDriver } from "../actions";
import { DriverForm } from "../driver-form";

export const metadata: Metadata = { title: "New driver" };

export default async function NewDriverPage() {
  await requireUser("fleet", "edit");
  const [branches, transporters] = await Promise.all([getBranchOptions(), getTransporterOptions()]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="New driver" back={{ href: "/logistics/drivers", label: "Drivers" }} />
      <DriverForm action={createDriver} branches={branches} transporters={transporters} cancelHref="/logistics/drivers" />
    </div>
  );
}
