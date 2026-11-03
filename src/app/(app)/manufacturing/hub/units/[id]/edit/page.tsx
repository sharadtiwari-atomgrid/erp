import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { getBranchOptions } from "@/lib/options";
import { updateUnit } from "../../../actions";
import { UnitForm } from "../../../unit-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Edit production unit" };

export default async function EditUnitPage({ params }: PageProps<"/manufacturing/hub/units/[id]/edit">) {
  await requireUser("hubSettings", "edit");
  const { id } = await params;
  const unit = await db.productionUnit.findUnique({ where: { id } });
  if (!unit) notFound();
  const branches = await getBranchOptions(unit.branchId);

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${unit.name}`} back={{ href: `/manufacturing/hub/units/${id}`, label: unit.name }} />
      <UnitForm
        action={updateUnit.bind(null, id)}
        branches={branches}
        cancelHref={`/manufacturing/hub/units/${id}`}
        initial={{ ...unit, shiftHours: num(unit.shiftHours) }}
      />
    </div>
  );
}
