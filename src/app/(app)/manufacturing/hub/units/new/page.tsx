import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getBranchOptions } from "@/lib/options";
import { createUnit } from "../../actions";
import { UnitForm } from "../../unit-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "New production unit" };

export default async function NewUnitPage() {
  await requireUser("hubSettings", "edit");
  const branches = await getBranchOptions();
  return (
    <div className="max-w-3xl">
      <PageHeader title="New production unit" back={{ href: "/manufacturing/hub", label: "Hub settings" }} />
      <UnitForm action={createUnit} branches={branches} cancelHref="/manufacturing/hub" />
    </div>
  );
}
