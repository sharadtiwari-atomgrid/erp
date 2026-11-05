import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { num } from "@/lib/format";
import { isoFromDay, todayIso } from "@/lib/ops/dates";
import { assetFormOptions } from "../../../_cash_fa/asset-data";
import { updateAsset } from "../../actions";
import { AssetForm } from "../../asset-form";

export const metadata: Metadata = { title: "Edit Fixed Asset" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function EditAssetPage({ params }: PageProps<"/finance/fixed-assets/[id]/edit">) {
  await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const { id } = await params;
  const asset = await db.fixedAsset.findUnique({ where: { id } });
  if (!asset) notFound();
  if (asset.status !== "ACTIVE") redirect(`/finance/fixed-assets/${id}`);
  const [options, acquisition, posted] = await Promise.all([
    assetFormOptions(),
    db.glEntry.count({ where: { sourceType: "FixedAsset", sourceId: id, documentType: "Asset acquisition", reversed: false } }),
    db.depreciationLine.count({ where: { assetId: id, run: { status: "POSTED" } } }),
  ]);
  return (
    <>
      <PageHeader title={`Edit ${asset.code}`} description={asset.name} back={{ href: `/finance/fixed-assets/${id}`, label: asset.code }} />
      <AssetForm
        action={updateAsset.bind(null, id)}
        cancelHref={`/finance/fixed-assets/${id}`}
        today={todayIso()}
        locked={acquisition > 0 || posted > 0}
        {...options}
        initial={{
          name: asset.name,
          category: asset.category,
          branchId: asset.branchId,
          location: asset.location,
          purchaseInvoiceId: asset.purchaseInvoiceId,
          acquisitionDate: isoFromDay(asset.acquisitionDate),
          cost: num(asset.cost),
          salvageValue: num(asset.salvageValue),
          method: asset.method,
          usefulLifeYears: asset.usefulLifeYears === null ? null : num(asset.usefulLifeYears),
          ratePct: asset.ratePct === null ? null : num(asset.ratePct),
          accumulatedDepreciation: num(asset.accumulatedDepreciation),
          depreciatedTo: asset.depreciatedTo ? isoFromDay(asset.depreciatedTo) : null,
          notes: asset.notes,
        }}
      />
    </>
  );
}
