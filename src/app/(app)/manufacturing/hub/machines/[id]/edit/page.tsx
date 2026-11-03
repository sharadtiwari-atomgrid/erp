import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { updateMachine } from "../../../actions";
import { MachineForm } from "../../../machine-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Edit machine" };

export default async function EditMachinePage({ params }: PageProps<"/manufacturing/hub/machines/[id]/edit">) {
  await requireUser("hubSettings", "edit");
  const { id } = await params;
  const machine = await db.machine.findUnique({ where: { id } });
  if (!machine) notFound();
  const units = await db.productionUnit.findMany({
    where: { OR: [{ isActive: true }, { id: machine.productionUnitId }] },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, shiftsPerDay: true, shiftHours: true },
  });

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${machine.code}`} back={{ href: `/manufacturing/hub/machines/${id}`, label: machine.name }} />
      <MachineForm
        action={updateMachine.bind(null, id)}
        units={units.map((u) => ({ ...u, shiftHours: num(u.shiftHours) }))}
        initial={{ ...machine, hoursPerDay: num(machine.hoursPerDay), hourlyCost: num(machine.hourlyCost) }}
        cancelHref={`/manufacturing/hub/machines/${id}`}
      />
    </div>
  );
}
