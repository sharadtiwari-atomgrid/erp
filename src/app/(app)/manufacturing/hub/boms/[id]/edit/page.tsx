import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { getComponentOptions, getMachineOptions, getManufacturedOptions } from "../../../../_lib/options";
import { updateBom } from "../../actions";
import { BomForm } from "../../bom-form";

export const metadata: Metadata = { title: "Edit BOM" };

export default async function EditBomPage({ params }: PageProps<"/manufacturing/hub/boms/[id]/edit">) {
  await requireUser("hubSettings", "edit");
  const { id } = await params;
  const bom = await db.bom.findUnique({
    where: { id },
    include: { lines: { orderBy: { position: "asc" } }, operations: { orderBy: { sequence: "asc" } } },
  });
  if (!bom) notFound();
  const [products, components, machines, locked] = await Promise.all([
    getManufacturedOptions(bom.productId),
    getComponentOptions(bom.lines.map((l) => l.componentId)),
    getMachineOptions(),
    db.productionOrder.count({ where: { bomId: id, status: { notIn: ["DRAFT", "CANCELLED"] } } }),
  ]);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`Edit ${bom.code} v${bom.version}`}
        description={locked > 0 ? "Scheduled or running production orders use this BOM, so saving will be refused. Copy it to a new version instead." : undefined}
        back={{ href: `/manufacturing/hub/boms/${id}`, label: bom.code }}
      />
      <BomForm
        action={updateBom.bind(null, id)}
        products={products}
        components={components}
        machines={machines}
        cancelHref={`/manufacturing/hub/boms/${id}`}
        initial={{
          productId: bom.productId,
          version: bom.version,
          outputQty: num(bom.outputQty),
          isDefault: bom.isDefault,
          isActive: bom.isActive,
          notes: bom.notes,
          lines: bom.lines.map((l) => ({ componentId: l.componentId, quantity: num(l.quantity), scrapPct: num(l.scrapPct) })),
          operations: bom.operations.map((o) => ({
            sequence: o.sequence,
            name: o.name,
            machineId: o.machineId,
            setupHours: num(o.setupHours),
            runHoursPerUnit: num(o.runHoursPerUnit),
          })),
        }}
      />
    </div>
  );
}
