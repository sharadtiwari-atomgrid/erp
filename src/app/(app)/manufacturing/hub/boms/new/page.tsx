import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { param } from "@/lib/forms";
import { getComponentOptions, getMachineOptions, getManufacturedOptions } from "../../../_lib/options";
import { createBom } from "../actions";
import { BomForm } from "../bom-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "New BOM" };

export default async function NewBomPage({ searchParams }: PageProps<"/manufacturing/hub/boms/new">) {
  await requireUser("hubSettings", "edit");
  const productId = param(await searchParams, "productId");
  const [products, components, machines, versions] = await Promise.all([
    getManufacturedOptions(),
    getComponentOptions(),
    getMachineOptions(),
    db.bom.groupBy({ by: ["productId"], _max: { version: true } }),
  ]);
  const versionsByProduct = Object.fromEntries(versions.map((v) => [v.productId, v._max.version ?? 0]));
  const preset = products.some((p) => p.id === productId) ? productId : "";

  return (
    <div className="max-w-5xl">
      <PageHeader title="New bill of materials" back={{ href: "/manufacturing/hub/boms", label: "Bills of materials" }} />
      <BomForm
        action={createBom}
        products={products}
        components={components}
        machines={machines}
        versionsByProduct={versionsByProduct}
        cancelHref="/manufacturing/hub/boms"
        initial={
          preset
            ? {
                productId: preset,
                version: (versionsByProduct[preset] ?? 0) + 1,
                outputQty: 1,
                isDefault: !versionsByProduct[preset],
                isActive: true,
                notes: null,
                lines: [],
                operations: [],
              }
            : undefined
        }
      />
    </div>
  );
}
