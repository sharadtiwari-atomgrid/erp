import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { param } from "@/lib/forms";
import { createMachine } from "../../actions";
import { MachineForm } from "../../machine-form";

export const metadata: Metadata = { title: "New machine" };

export default async function NewMachinePage({ searchParams }: PageProps<"/manufacturing/hub/machines/new">) {
  await requireUser("hubSettings", "edit");
  const unitId = param(await searchParams, "unitId");
  const units = await db.productionUnit.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, shiftsPerDay: true, shiftHours: true },
  });

  return (
    <div className="max-w-3xl">
      <PageHeader title="New machine" back={{ href: "/manufacturing/hub/machines", label: "Machines" }} />
      {units.length === 0 ? (
        <p className="text-sm text-ink-soft">Create a production unit first.</p>
      ) : (
        <MachineForm
          action={createMachine}
          units={units.map((u) => ({ ...u, shiftHours: num(u.shiftHours) }))}
          initial={{ productionUnitId: units.some((u) => u.id === unitId) ? unitId : units[0].id }}
          cancelHref="/manufacturing/hub/machines"
        />
      )}
    </div>
  );
}
