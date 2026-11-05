import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { todayIso } from "@/lib/ops/dates";
import { assetFormOptions } from "../../_cash_fa/asset-data";
import { createAsset } from "../actions";
import { AssetForm } from "../asset-form";

export const metadata: Metadata = { title: "New Fixed Asset" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function NewAssetPage() {
  await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const options = await assetFormOptions();
  return (
    <>
      <PageHeader title="New Fixed Asset" back={{ href: "/finance/fixed-assets", label: "Fixed Assets" }} />
      <AssetForm action={createAsset} cancelHref="/finance/fixed-assets" today={todayIso()} {...options} />
    </>
  );
}
