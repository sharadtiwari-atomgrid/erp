import "server-only";
import type { Tx } from "@/lib/db";
import { num } from "@/lib/format";
import { addDaysIso, dayFromIso, isoFromDay } from "@/lib/ops/dates";
import { ASSET_CATEGORY_ACCOUNTS, money } from "./chart";
import { FinanceError, postTransaction, reverseTransaction, type PostingLineInput } from "./posting";

/**
 * Ledger postings for fixed assets: acquisition, disposal and depreciation
 * runs. Every posting goes through postTransaction / reverseTransaction.
 *
 * sourceType "FixedAsset" (acquisition, disposal) and "DepreciationRun".
 */

export const ASSET_SOURCE = "FixedAsset";
export const RUN_SOURCE = "DepreciationRun";

/** Cost account code for an asset category (defaults to plant & machinery). */
export function assetCostAccountCode(category: string): string {
  return ASSET_CATEGORY_ACCOUNTS[category] ?? ASSET_CATEGORY_ACCOUNTS.Other;
}

/** Latest live (not reversed) transaction of a given document type for an asset, or null. */
export async function assetPosting(tx: Tx, assetId: string, documentType: "Asset acquisition" | "Asset disposal") {
  const e = await tx.glEntry.findFirst({
    where: { sourceType: ASSET_SOURCE, sourceId: assetId, documentType, reversed: false },
    orderBy: { transactionNo: "desc" },
    select: { transactionNo: true, postingDate: true },
  });
  return e;
}

/** Branch code to tag lines with, for the BRANCH dimension. */
async function branchCode(tx: Tx, branchId: string | null | undefined) {
  if (!branchId) return undefined;
  const b = await tx.branch.findUnique({ where: { id: branchId }, select: { code: true } });
  return b?.code;
}

/**
 * Acquisition not booked through a purchase invoice:
 * Dr asset cost account (cost) / Cr accumulated depreciation (any brought-forward
 * depreciation) / Cr the chosen bank, payables or equity account (the rest).
 */
export async function postAssetAcquisition(tx: Tx, assetId: string, opts: { date: string; creditAccountId: string; contactId?: string | null; userId: string | null }) {
  const asset = await tx.fixedAsset.findUniqueOrThrow({ where: { id: assetId } });
  if (await assetPosting(tx, assetId, "Asset acquisition")) throw new FinanceError("The acquisition of this asset is already posted.");
  const cost = num(asset.cost);
  const broughtForward = num(asset.accumulatedDepreciation);
  // Only depreciation brought forward (not charged by runs here) is booked with the acquisition.
  const runs = await tx.depreciationLine.aggregate({ where: { assetId, run: { status: "POSTED" } }, _sum: { amount: true } });
  const bf = money(broughtForward - num(runs._sum.amount));
  const code = await branchCode(tx, asset.branchId);
  const dims = code ? { BRANCH: code } : undefined;
  const lines: PostingLineInput[] = [
    { account: { code: assetCostAccountCode(asset.category) }, debit: cost, description: `${asset.code} ${asset.name}`, dimensions: dims },
    { account: { id: opts.creditAccountId }, credit: money(cost - Math.max(0, bf)), contactId: opts.contactId ?? null },
  ];
  if (bf > 0) lines.push({ account: "ACCUMULATED_DEPRECIATION", credit: bf, description: `${asset.code} depreciation brought forward`, dimensions: dims });
  return postTransaction(tx, {
    date: opts.date,
    documentType: "Asset acquisition",
    documentNo: asset.code,
    sourceType: ASSET_SOURCE,
    sourceId: asset.id,
    description: `Acquisition of ${asset.code} ${asset.name}`,
    branchId: asset.branchId,
    userId: opts.userId,
    lines,
  });
}

export type DisposalFigures = { cost: number; accumulated: number; catchUp: number; bookValue: number; saleAmount: number; gain: number; loss: number };

/** Gain or loss on disposal: sale amount − (cost − accumulated − catch-up depreciation). */
export function disposalFigures(cost: number, accumulated: number, catchUp: number, saleAmount: number): DisposalFigures {
  const bookValue = money(cost - accumulated - catchUp);
  const result = money(saleAmount - bookValue);
  return { cost, accumulated, catchUp, bookValue, saleAmount, gain: result > 0 ? result : 0, loss: result < 0 ? -result : 0 };
}

/**
 * Disposal (sale or scrap), in one transaction:
 * Dr Depreciation expense / (Cr) Accumulated depreciation for any catch-up
 * depreciation up to the disposal date (netted below),
 * Dr Accumulated depreciation (accumulated before catch-up),
 * Dr Bank / receivable (sale amount),
 * Cr Asset cost account (cost),
 * Cr Profit on sale of assets or Dr Loss on sale of assets (the balance).
 * Updates the asset to DISPOSED.
 */
export async function postAssetDisposal(
  tx: Tx,
  assetId: string,
  opts: { date: string; saleAmount: number; receiveAccountId: string | null; catchUp: number; userId: string | null },
) {
  const asset = await tx.fixedAsset.findUniqueOrThrow({ where: { id: assetId } });
  if (asset.status !== "ACTIVE") throw new FinanceError("This asset is already disposed.");
  if (opts.date < isoFromDay(asset.acquisitionDate)) throw new FinanceError("The disposal date is before the acquisition date.");
  if (asset.depreciatedTo && opts.date < isoFromDay(asset.depreciatedTo)) {
    throw new FinanceError(`Depreciation is already charged up to ${isoFromDay(asset.depreciatedTo)}. Reverse that depreciation run or choose a later date.`);
  }
  if (opts.saleAmount > 0 && !opts.receiveAccountId) throw new FinanceError("Choose the account that receives the sale amount.");
  const f = disposalFigures(num(asset.cost), num(asset.accumulatedDepreciation), opts.catchUp, opts.saleAmount);
  const code = await branchCode(tx, asset.branchId);
  const dims = code ? { BRANCH: code } : undefined;
  const label = `${asset.code} ${asset.name}`;
  const lines: PostingLineInput[] = [
    { account: "DEPRECIATION_EXPENSE", debit: f.catchUp, description: `${label} depreciation to disposal`, dimensions: dims },
    { account: "ACCUMULATED_DEPRECIATION", debit: f.accumulated, description: label, dimensions: dims },
    { account: { code: assetCostAccountCode(asset.category) }, credit: f.cost, description: label, dimensions: dims },
    { account: "ASSET_DISPOSAL_GAIN", credit: f.gain, description: label, dimensions: dims },
    { account: "ASSET_DISPOSAL_LOSS", debit: f.loss, description: label, dimensions: dims },
  ];
  if (opts.saleAmount > 0 && opts.receiveAccountId) lines.push({ account: { id: opts.receiveAccountId }, debit: opts.saleAmount, description: `Sale of ${label}` });
  const transactionNo = await postTransaction(tx, {
    date: opts.date,
    documentType: "Asset disposal",
    documentNo: asset.code,
    sourceType: ASSET_SOURCE,
    sourceId: asset.id,
    description: `${opts.saleAmount > 0 ? "Sale" : "Scrapping"} of ${label}`,
    branchId: asset.branchId,
    userId: opts.userId,
    lines,
  });
  await tx.fixedAsset.update({
    where: { id: assetId },
    data: {
      status: "DISPOSED",
      disposalDate: dayFromIso(opts.date),
      disposalAmount: opts.saleAmount,
      accumulatedDepreciation: money(f.accumulated + f.catchUp),
      depreciatedTo: f.catchUp > 0 ? dayFromIso(opts.date) : asset.depreciatedTo,
    },
  });
  return { transactionNo, figures: f };
}

/**
 * Posts a DRAFT depreciation run whose lines are already calculated:
 * Dr Depreciation expense / Cr Accumulated depreciation, one pair of lines per
 * asset tagged with the asset's BRANCH dimension (the transaction carries the
 * branch when every asset shares one). Updates each asset's accumulated
 * depreciation and depreciatedTo, and stores the transaction number.
 */
export async function postDepreciationRun(tx: Tx, runId: string, userId: string | null) {
  const run = await tx.depreciationRun.findUniqueOrThrow({
    where: { id: runId },
    include: { lines: { include: { asset: { select: { id: true, code: true, name: true, branchId: true, status: true, branch: { select: { code: true } } } } } } },
  });
  if (run.status !== "DRAFT") throw new FinanceError("Only a draft run can be posted.");
  const lines = run.lines.filter((l) => num(l.amount) > 0);
  if (lines.length === 0) throw new FinanceError("There is no depreciation to post in this run.");
  const periodEnd = isoFromDay(run.periodEnd);
  const branches = new Set(lines.map((l) => l.asset.branchId ?? ""));
  const posting: PostingLineInput[] = [];
  for (const l of lines) {
    const dims = l.asset.branch?.code ? { BRANCH: l.asset.branch.code } : undefined;
    const description = `${l.asset.code} ${l.asset.name}`;
    posting.push({ account: "DEPRECIATION_EXPENSE", debit: num(l.amount), description, dimensions: dims });
    posting.push({ account: "ACCUMULATED_DEPRECIATION", credit: num(l.amount), description, dimensions: dims });
  }
  const transactionNo = await postTransaction(tx, {
    date: periodEnd,
    documentType: "Depreciation",
    documentNo: run.number,
    sourceType: RUN_SOURCE,
    sourceId: run.id,
    description: `Depreciation ${run.number} to ${periodEnd}`,
    branchId: branches.size === 1 ? [...branches][0] || null : null,
    userId,
    lines: posting,
  });
  for (const l of lines) {
    await tx.fixedAsset.update({
      where: { id: l.assetId },
      data: { accumulatedDepreciation: { increment: num(l.amount) }, depreciatedTo: run.periodEnd },
    });
  }
  const total = money(lines.reduce((s, l) => s + num(l.amount), 0));
  await tx.depreciationRun.update({ where: { id: runId }, data: { status: "POSTED", transactionNo, total } });
  return transactionNo;
}

/**
 * Reverses a posted run and restores each asset's accumulated depreciation and
 * depreciatedTo (to the end of that asset's previous posted run, else the day
 * before this run's period when depreciation remains, else never). Allowed only
 * when no later posted run or disposal involves the run's assets.
 */
export async function reverseDepreciationRun(tx: Tx, runId: string, opts: { date: string; userId: string | null }) {
  const run = await tx.depreciationRun.findUniqueOrThrow({ where: { id: runId }, include: { lines: { include: { asset: true } } } });
  if (run.status !== "POSTED" || !run.transactionNo) throw new FinanceError("Only a posted run can be reversed.");
  for (const l of run.lines) {
    if (l.asset.status === "DISPOSED") throw new FinanceError(`${l.asset.code} has been disposed of; its depreciation can no longer be reversed.`);
    const later = await tx.depreciationLine.findFirst({
      where: { assetId: l.assetId, runId: { not: run.id }, run: { status: "POSTED", periodEnd: { gt: run.periodEnd } } },
      select: { run: { select: { number: true } } },
    });
    if (later) throw new FinanceError(`${l.asset.code} is also in the later run ${later.run.number}. Reverse that run first.`);
  }
  const reversalTx = await reverseTransaction(tx, run.transactionNo, { date: opts.date, userId: opts.userId, reason: `Reversal of depreciation ${run.number}` });
  for (const l of run.lines) {
    const accumulated = money(num(l.asset.accumulatedDepreciation) - num(l.amount));
    const previous = await tx.depreciationLine.findFirst({
      where: { assetId: l.assetId, runId: { not: run.id }, run: { status: "POSTED" } },
      orderBy: { run: { periodEnd: "desc" } },
      select: { run: { select: { periodEnd: true } } },
    });
    const dayBefore = addDaysIso(isoFromDay(run.periodStart), -1);
    const depreciatedTo = previous
      ? previous.run.periodEnd
      : accumulated > 0 && dayBefore >= isoFromDay(l.asset.acquisitionDate)
        ? dayFromIso(dayBefore)
        : null;
    await tx.fixedAsset.update({ where: { id: l.assetId }, data: { accumulatedDepreciation: Math.max(0, accumulated), depreciatedTo } });
  }
  await tx.depreciationRun.update({ where: { id: runId }, data: { status: "REVERSED" } });
  return reversalTx;
}
