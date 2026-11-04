"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, tdsQuarterOf } from "@/lib/finance/chart";
import { FinanceError, postTransaction } from "@/lib/finance/posting";
import { num } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { dayFromIso, parseDay, todayIso } from "@/lib/ops/dates";
import { defaultRate, kindOf } from "./_lib/tds";

const isoDate = (label: string) =>
  z.string().transform((v, ctx) => {
    const iso = parseDay(v);
    if (!iso) ctx.addIssue({ code: "custom", message: `Enter the ${label}` });
    return iso;
  });

function fail(e: unknown): ActionState {
  if (e instanceof FinanceError) return { error: e.message };
  throw e;
}

// ── Sections ────────────────────────────────────────────────────────────────

const sectionSchema = z.object({
  code: f.text("Section").max(20),
  description: f.text("Description"),
  kind: z.enum(["TDS", "TCS"]),
  rateIndividual: f.number({ label: "Rate (individual)" }).max(100, "Rate must be at most 100%"),
  rateCompany: f.number({ label: "Rate (company)" }).max(100, "Rate must be at most 100%"),
  thresholdSingle: z.string().optional().transform((v) => (v?.trim() ? Number(v) : null)).refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Enter a valid amount"),
  thresholdAnnual: z.string().optional().transform((v) => (v?.trim() ? Number(v) : null)).refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Enter a valid amount"),
  isActive: f.checkbox(),
});

export async function saveTdsSection(id: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(sectionSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = { ...parsed.data, code: parsed.data.code.toUpperCase() };
  const clash = await db.tdsSection.findFirst({ where: { code: data.code, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (clash) return { error: "Please fix the highlighted fields.", fieldErrors: { code: ["This section already exists"] } };
  await db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.tdsSection.findUniqueOrThrow({ where: { id } });
      const after = await tx.tdsSection.update({ where: { id }, data });
      await recordChange({ userId: user.id, entityType: "TdsSection", entityId: id, action: "updated", message: `${after.kind} section ${after.code} updated`, changes: diff(before, after) }, tx);
    } else {
      const created = await tx.tdsSection.create({ data });
      await recordChange({ userId: user.id, entityType: "TdsSection", entityId: created.id, action: "created", message: `${created.kind} section ${created.code} created` }, tx);
    }
  });
  revalidatePath("/finance/tds/sections");
  redirect(`/finance/tds/sections?kind=${data.kind}`);
}

export async function deleteTdsSection(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const section = await db.tdsSection.findUnique({ where: { id }, include: { _count: { select: { entries: true, vendorPayments: true } } } });
  if (!section) return { error: "Section not found." };
  if (section._count.entries > 0 || section._count.vendorPayments > 0) {
    return { error: "This section has entries or payments. Mark it inactive instead." };
  }
  await db.$transaction(async (tx) => {
    await tx.tdsSection.delete({ where: { id } });
    await recordChange({ userId: user.id, entityType: "TdsSection", entityId: id, action: "deleted", message: `${section.kind} section ${section.code} deleted` }, tx);
  });
  revalidatePath("/finance/tds/sections");
  return { success: "Section deleted." };
}

// ── Manual entries ──────────────────────────────────────────────────────────

const entrySchema = z.object({
  sectionId: f.id("Section"),
  contactId: f.id("Party"),
  date: isoDate("date"),
  documentType: f.optionalText(),
  documentNo: f.optionalText(),
  baseAmount: f.number({ min: 0.01, label: "Amount paid / received" }),
  rate: z.string().optional().transform((v) => (v?.trim() ? Number(v) : null)).refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), "Enter a rate between 0 and 100"),
  amount: z.string().optional().transform((v) => (v?.trim() ? Number(v) : null)).refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Enter a valid amount"),
});

/**
 * Adds a TDS / TCS register entry by hand (for deductions made outside vendor
 * payments, e.g. through a journal). It does not post to the ledger: the
 * journal or document that withheld the tax does that.
 */
export async function createManualTdsEntry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(entrySchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  if (d.date > todayIso()) return { error: "The date cannot be in the future.", fieldErrors: { date: ["Cannot be in the future"] } };
  const [section, contact] = await Promise.all([
    db.tdsSection.findUnique({ where: { id: d.sectionId } }),
    db.contact.findUnique({ where: { id: d.contactId }, select: { id: true, name: true, pan: true } }),
  ]);
  if (!section) return { fieldErrors: { sectionId: ["Choose a section"] } };
  if (!contact) return { fieldErrors: { contactId: ["Choose a party"] } };
  const rate = d.rate ?? defaultRate({ rateIndividual: num(section.rateIndividual), rateCompany: num(section.rateCompany) }, contact.pan);
  const amount = money(d.amount ?? (d.baseAmount * rate) / 100);
  if (amount <= 0) return { error: "The tax amount must be more than zero." };
  const entry = await db.$transaction(async (tx) => {
    const created = await tx.tdsEntry.create({
      data: {
        kind: section.kind,
        sectionId: section.id,
        contactId: contact.id,
        date: dayFromIso(d.date),
        documentType: d.documentType ?? "Manual",
        documentNo: d.documentNo,
        baseAmount: money(d.baseAmount),
        rate,
        amount,
        quarter: tdsQuarterOf(d.date),
      },
    });
    await recordChange(
      { userId: user.id, entityType: "TdsEntry", entityId: created.id, action: "created", message: `Manual ${section.kind} entry ${section.code} for ${contact.name}: ${amount.toFixed(2)}` },
      tx,
    );
    return created;
  });
  revalidatePath("/finance/tds");
  redirect(`/finance/tds?kind=${entry.kind}&quarter=${encodeURIComponent(entry.quarter)}`);
}

export async function deleteManualTdsEntry(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const entry = await db.tdsEntry.findUnique({ where: { id }, include: { section: { select: { code: true } } } });
  if (!entry) return { error: "Entry not found." };
  if (entry.status !== "PENDING") return { error: "Only pending entries can be deleted." };
  if (entry.sourceId) return { error: "This entry comes from a document; cancel the document instead." };
  await db.$transaction(async (tx) => {
    await tx.tdsEntry.delete({ where: { id } });
    await recordChange({ userId: user.id, entityType: "TdsEntry", entityId: id, action: "deleted", message: `${entry.kind} entry ${entry.section.code} deleted` }, tx);
  });
  revalidatePath("/finance/tds");
  return { success: "Entry deleted." };
}

// ── Challans and filing ─────────────────────────────────────────────────────

const challanSchema = z.object({
  challanNo: f.text("Challan no.").max(40),
  challanDate: isoDate("challan date"),
  amount: f.number({ min: 0.01, label: "Amount" }),
  bankAccountId: f.optionalText(),
  postToLedger: f.checkbox(),
});

/**
 * Records a tax challan for selected pending entries of one section: they
 * become DEPOSITED. Optionally posts the payment: Dr TDS (or TCS) payable /
 * Cr bank, with a difference of up to ₹1 to rounding off.
 */
export async function recordChallan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(challanSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const ids = formData.getAll("entryIds").map(String).filter(Boolean);
  if (ids.length === 0) return { error: "Select at least one pending entry." };
  if (d.challanDate > todayIso()) return { error: "The challan date cannot be in the future.", fieldErrors: { challanDate: ["Cannot be in the future"] } };
  if (d.postToLedger && !d.bankAccountId) return { error: "Choose the bank account the tax was paid from.", fieldErrors: { bankAccountId: ["Required to post the payment"] } };

  try {
    const result = await db.$transaction(async (tx) => {
      const entries = await tx.tdsEntry.findMany({ where: { id: { in: ids } }, include: { section: { select: { code: true } } } });
      if (entries.length !== ids.length) throw new FinanceError("Some selected entries no longer exist. Refresh and try again.");
      if (entries.some((e) => e.status !== "PENDING")) throw new FinanceError("Some selected entries are already deposited.");
      const sections = new Set(entries.map((e) => e.sectionId));
      if (sections.size > 1) throw new FinanceError("A challan covers one section. Select entries of a single section.");
      const kind = kindOf(entries[0].kind);
      const total = money(entries.reduce((s, e) => s + num(e.amount), 0));
      const difference = money(d.amount - total);
      if (Math.abs(difference) > 1) {
        throw new FinanceError(
          `The challan amount differs from the selected ${kind} (${total.toFixed(2)}) by ${difference.toFixed(2)}. Record interest or fees with a journal and enter the tax amount here.`,
        );
      }
      if (d.postToLedger) {
        const bank = await tx.bankAccount.findUnique({ where: { id: d.bankAccountId! }, select: { glAccountId: true, name: true } });
        if (!bank) throw new FinanceError("Choose a valid bank account.");
        await postTransaction(tx, {
          date: d.challanDate,
          documentType: `${kind} challan`,
          documentNo: d.challanNo,
          sourceType: "TdsChallan",
          sourceId: `${kind}:${d.challanNo}`,
          description: `${kind} ${entries[0].section.code} deposited, challan ${d.challanNo}`,
          userId: user.id,
          lines: [
            { account: kind === "TCS" ? "TCS_PAYABLE" : "TDS_PAYABLE", debit: total },
            ...(difference > 0 ? [{ account: "ROUNDING" as const, debit: difference }] : []),
            ...(difference < 0 ? [{ account: "ROUNDING" as const, credit: -difference }] : []),
            { account: { id: bank.glAccountId }, credit: d.amount },
          ],
        });
      }
      await tx.tdsEntry.updateMany({ where: { id: { in: ids } }, data: { status: "DEPOSITED", challanNo: d.challanNo, challanDate: dayFromIso(d.challanDate) } });
      for (const e of entries) {
        await recordChange({ userId: user.id, entityType: "TdsEntry", entityId: e.id, action: "deposited", message: `${kind} deposited with challan ${d.challanNo}` }, tx);
      }
      return { count: entries.length, total };
    });
    revalidatePath("/finance/tds");
    revalidatePath("/finance");
    return { success: `Challan ${d.challanNo} recorded for ${result.count} ${result.count === 1 ? "entry" : "entries"} (${result.total.toFixed(2)}).` };
  } catch (e) {
    return fail(e);
  }
}

/** Marks every deposited entry of a quarter as filed (after the quarterly return is filed). */
export async function markQuarterFiled(kind: string, quarter: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const k = kindOf(kind);
  const pending = await db.tdsEntry.count({ where: { kind: k, quarter, status: "PENDING" } });
  if (pending > 0) return { error: `${pending} ${k} ${pending === 1 ? "entry is" : "entries are"} not yet deposited for ${quarter}. Record the challans first.` };
  const res = await db.tdsEntry.updateMany({ where: { kind: k, quarter, status: "DEPOSITED" }, data: { status: "FILED" } });
  if (res.count === 0) return { error: `Nothing to mark: no deposited ${k} entries in ${quarter}.` };
  await recordChange({ userId: user.id, entityType: "TdsQuarter", entityId: `${k}:${quarter}`, action: "filed", message: `${k} return for ${quarter} marked as filed (${res.count} entries)` });
  revalidatePath("/finance/tds");
  return { success: `${res.count} entries marked as filed.` };
}
