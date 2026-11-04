"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assetPosting, postAssetAcquisition, postAssetDisposal } from "@/lib/finance/assets";
import { formatMoney, num } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { dayFromIso } from "@/lib/ops/dates";
import { nextDocumentNumber } from "@/lib/sequence";
import { ASSET_CATEGORIES } from "../_cash_fa/constants";
import { depreciationFor, settingsProblem } from "../_cash_fa/depreciation";
import { toDepreciable } from "../_cash_fa/asset-data";
import { attempt, CashFaError } from "../_cash_fa/server";

const optionalNumber = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Enter a number of zero or more");

const optionalIsoDate = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date");

const assetSchema = z.object({
  name: f.text("Name"),
  category: z.enum(ASSET_CATEGORIES, { error: "Choose a category" }),
  branchId: f.optionalText(),
  location: f.optionalText(),
  purchaseInvoiceId: f.optionalText(),
  acquisitionDate: z.iso.date("Enter the acquisition date"),
  cost: f.number({ min: 0.01, label: "Cost" }),
  salvageValue: f.number({ label: "Salvage value" }),
  method: z.enum(["SLM", "WDV"], { error: "Choose a method" }),
  usefulLifeYears: optionalNumber(),
  ratePct: optionalNumber(),
  accumulatedDepreciation: f.number({ label: "Depreciation brought forward" }),
  depreciatedTo: optionalIsoDate(),
  notes: f.optionalText(),
});

type AssetInput = z.infer<typeof assetSchema>;

function readAsset(formData: FormData): { ok: true; data: AssetInput } | { ok: false; state: ActionState } {
  const parsed = parseForm(assetSchema, formData);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  const fieldErrors: Record<string, string[]> = {};
  const problem = settingsProblem({ ...d, usefulLifeYears: d.method === "SLM" ? d.usefulLifeYears : null, ratePct: d.method === "WDV" ? d.ratePct : null });
  if (problem) fieldErrors[/life/.test(problem) ? "usefulLifeYears" : /rate/.test(problem) ? "ratePct" : /Salvage/.test(problem) ? "salvageValue" : "cost"] = [problem];
  if (d.accumulatedDepreciation > d.cost - d.salvageValue) fieldErrors.accumulatedDepreciation = ["Cannot exceed cost less salvage value"];
  if (d.accumulatedDepreciation > 0 && !d.depreciatedTo) fieldErrors.depreciatedTo = ["Enter the date it was depreciated up to"];
  if (d.depreciatedTo && d.depreciatedTo < d.acquisitionDate) fieldErrors.depreciatedTo = ["Cannot be before the acquisition date"];
  if (Object.keys(fieldErrors).length) return { ok: false, state: { error: "Please fix the highlighted fields.", fieldErrors } };
  return {
    ok: true,
    data: { ...d, usefulLifeYears: d.method === "SLM" ? d.usefulLifeYears : null, ratePct: d.method === "WDV" ? d.ratePct : null },
  };
}

function toData(d: AssetInput) {
  return {
    ...d,
    acquisitionDate: dayFromIso(d.acquisitionDate),
    depreciatedTo: d.depreciatedTo ? dayFromIso(d.depreciatedTo) : null,
  };
}

function refresh(id?: string) {
  revalidatePath("/finance/fixed-assets");
  if (id) revalidatePath(`/finance/fixed-assets/${id}`);
}

export async function createAsset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const read = readAsset(formData);
  if (!read.ok) return read.state;
  const asset = await db.$transaction(async (tx) => {
    const code = await nextDocumentNumber(tx, "FIXED_ASSET");
    const created = await tx.fixedAsset.create({ data: { ...toData(read.data), code } });
    await recordChange({ userId: user.id, entityType: "FixedAsset", entityId: created.id, action: "created", message: `Fixed asset ${code} ${created.name} created` }, tx);
    return created;
  });
  refresh();
  redirect(`/finance/fixed-assets/${asset.id}`);
}

/** Whether an asset's financial fields are locked (acquisition or depreciation posted). */
async function isLocked(id: string) {
  const [acq, lines] = await Promise.all([
    db.$transaction((tx) => assetPosting(tx, id, "Asset acquisition")),
    db.depreciationLine.count({ where: { assetId: id, run: { status: "POSTED" } } }),
  ]);
  return !!acq || lines > 0;
}

export async function updateAsset(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const read = readAsset(formData);
  if (!read.ok) return read.state;
  const before = await db.fixedAsset.findUnique({ where: { id } });
  if (!before) return { error: "This asset no longer exists." };
  if (before.status !== "ACTIVE") return { error: "A disposed asset can't be edited." };
  let data = toData(read.data);
  if (await isLocked(id)) {
    // Posted figures stay as they are; only descriptive and future-depreciation settings change.
    data = {
      ...data,
      category: before.category as AssetInput["category"],
      acquisitionDate: before.acquisitionDate,
      cost: num(before.cost),
      accumulatedDepreciation: num(before.accumulatedDepreciation),
      depreciatedTo: before.depreciatedTo,
    };
    if (data.salvageValue > num(before.cost)) return { error: "Salvage value cannot exceed the cost.", fieldErrors: { salvageValue: ["Too high"] } };
  }
  await db.$transaction(async (tx) => {
    const after = await tx.fixedAsset.update({ where: { id }, data });
    await recordChange({ userId: user.id, entityType: "FixedAsset", entityId: id, action: "updated", message: `Fixed asset ${after.code} updated`, changes: diff(before, after) }, tx);
  });
  refresh(id);
  redirect(`/finance/fixed-assets/${id}`);
}

const acquisitionSchema = z.object({
  date: z.iso.date("Enter the posting date"),
  creditAccountId: f.id("Account to credit"),
});

/** Dr asset cost account / Cr chosen bank, payables or equity account (and accumulated depreciation b/f). */
export async function postAcquisition(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(acquisitionSchema, formData);
  if (!parsed.ok) return parsed.state;
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const asset = await tx.fixedAsset.findUnique({ where: { id } });
      if (!asset) throw new CashFaError("Asset not found.");
      if (asset.status !== "ACTIVE") throw new CashFaError("The asset is disposed.");
      const transactionNo = await postAssetAcquisition(tx, id, { date: parsed.data.date, creditAccountId: parsed.data.creditAccountId, userId: user.id });
      await recordChange({ userId: user.id, entityType: "FixedAsset", entityId: id, action: "posted", message: `Acquisition of ${asset.code} for ${formatMoney(asset.cost)} posted (transaction ${transactionNo})` }, tx);
      return transactionNo;
    }),
  );
  if (!result.ok) return { error: result.error };
  refresh(id);
  revalidatePath("/finance", "layout");
  return { success: `Posted as transaction ${result.value}.` };
}

const disposalSchema = z.object({
  date: z.iso.date("Enter the disposal date"),
  saleAmount: f.number({ label: "Sale amount" }),
  receiveAccountId: f.optionalText(),
  chargeDepreciation: f.checkbox(),
});

/** Sale or scrapping; see postAssetDisposal for the posting. */
export async function disposeAsset(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(disposalSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  if (d.saleAmount > 0 && !d.receiveAccountId) return { error: "Choose the account that receives the sale amount.", fieldErrors: { receiveAccountId: ["Required for a sale"] } };
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const asset = await tx.fixedAsset.findUnique({ where: { id } });
      if (!asset) throw new CashFaError("Asset not found.");
      const catchUp = d.chargeDepreciation
        ? depreciationFor(toDepreciable(asset), d.date).amount
        : 0;
      const { transactionNo, figures } = await postAssetDisposal(tx, id, { date: d.date, saleAmount: d.saleAmount, receiveAccountId: d.receiveAccountId, catchUp, userId: user.id });
      const outcome = figures.gain > 0 ? `gain ${formatMoney(figures.gain)}` : figures.loss > 0 ? `loss ${formatMoney(figures.loss)}` : "no gain or loss";
      await recordChange({ userId: user.id, entityType: "FixedAsset", entityId: id, action: "disposed", message: `${asset.code} disposed for ${formatMoney(d.saleAmount)}, ${outcome} (transaction ${transactionNo})` }, tx);
      return transactionNo;
    }),
  );
  if (!result.ok) return { error: result.error };
  refresh(id);
  revalidatePath("/finance", "layout");
  return { success: `Disposal posted as transaction ${result.value}.` };
}
