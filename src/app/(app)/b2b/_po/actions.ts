"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { z } from "zod";
import type { FreshPo, Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { diff, recordChange } from "@/lib/audit";
import { db } from "@/lib/db";
import { formatDmy } from "@/lib/ops/dates";
import { FRESH_PO_DOC_KINDS } from "@/lib/ops/lists";
import { createMisJobFromFreshPo } from "@/lib/ops/mis";
import { nextRequestNo, withSerial } from "@/lib/ops/serials";
import { nextDocumentNumber } from "@/lib/sequence";
import { deleteStoredFile, fileUrl, saveFile } from "@/lib/storage";
import {
  FIELD_PHASE,
  fieldLabel,
  PO_FIELDS,
  STAGES,
  TEAM_LABELS,
  teamCanEdit,
  type BoardKind,
  type Stage,
} from "./fields";
import { cleanRow, importChanges, IMPORT_MAX_ROWS, matchPo, parseFreshPoSheet, type SheetColumn, type SheetRow } from "./import-sheet";
import { blankEntry, canMoveToMis, computeTotal, deriveStage, earlierStage, missingUpTo, stageAfter } from "./logic";
import { actingTeam, ENTITY, moveToBoard, poValues, toData } from "./server";
import { daysInFreshPo, LONG_HOLD_DAYS } from "./sla";
import type { ContactOption, DocItem, HistoryItem, ProductOption, SaveResult, SimpleResult } from "./types";

const MAX_UPLOAD = 25 * 1024 * 1024;

function refresh() {
  revalidatePath("/b2b/fresh-po");
  revalidatePath("/b2b/long-hold");
  revalidatePath("/b2b/archives");
}

const fail = (error: string) => ({ ok: false as const, error });
const label = (po: Pick<FreshPo, "requestNo">) => (po.requestNo ? `PO #${po.requestNo}` : "The PO");

/** The tracked part of a PO, for history diffs. */
function tracked(po: FreshPo): Record<string, unknown> {
  const rec = po as unknown as Record<string, unknown>;
  return Object.fromEntries([...PO_FIELDS, "stage", "board", "requestNo"].map((k) => [k, rec[k]]));
}

const valuesSchema = z.record(z.string(), z.string().max(5000));

const saveSchema = z.object({
  id: z.string().optional(),
  team: z.string(),
  values: valuesSchema,
  advance: z.enum(["demand", "supply", "logistics"]).nullable().optional(),
  confirmDuplicate: z.boolean().optional(),
});

// ─── Create / edit ──────────────────────────────────────────────────────────

/**
 * Saves the entry form. New POs send every field; edits send only the fields
 * that changed, so two teams working on the same PO don't overwrite each other.
 * `advance` validates that phase and every earlier one, then moves the stage on.
 */
export async function savePo(input: z.input<typeof saveSchema>): Promise<SaveResult> {
  const user = await requireUser("b2bOrders", "edit");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail("The form could not be read. Reload and try again.");
  const { id, advance, confirmDuplicate } = parsed.data;
  const team = await actingTeam(user, parsed.data.team);
  const values = Object.fromEntries(Object.entries(parsed.data.values).filter(([k]) => PO_FIELDS.includes(k)));

  if (advance && !teamCanEdit(team, advance)) return fail(`Acting as ${TEAM_LABELS[team]}, you can’t submit the ${advance} section.`);

  const before = id ? await db.freshPo.findFirst({ where: { id, deletedAt: null } }) : null;
  if (id && !before) return fail("This PO no longer exists — it may have been deleted.");
  const beforeValues = before ? poValues(before) : blankEntry();

  // Each team edits only its own section. HSN may be filled in from the product when it was blank.
  const blocked = Object.entries(values).filter(([k, v]) => {
    if (teamCanEdit(team, FIELD_PHASE[k])) return false;
    if ((beforeValues[k] ?? "") === v.trim()) return false;
    return !(k === "hsnCode" && !beforeValues.hsnCode);
  });
  if (blocked.length) {
    return fail(`Acting as ${TEAM_LABELS[team]}, you can’t change ${blocked.map(([k]) => fieldLabel(k)).join(", ")}.`);
  }

  const merged: Record<string, string> = { ...beforeValues, ...values };
  const total = computeTotal(merged.qtyToDispatch, merged.rate);
  const qtyOrRateSent = !before || "qtyToDispatch" in values || "rate" in values;
  if (total && qtyOrRateSent && total !== beforeValues.totalTaxable) values.totalTaxable = merged.totalTaxable = total;

  const { data, errors } = toData(values);
  if (errors.length) return fail(errors.join(". "));

  if (advance) {
    const missing = missingUpTo(advance, merged);
    if (missing.length) return { ok: false, error: `${missing.length} required field${missing.length > 1 ? "s" : ""} still needed.`, missing };
  }

  if (!before) {
    if (!confirmDuplicate && data.customer && data.product) {
      const dup = await db.freshPo.findFirst({
        where: {
          deletedAt: null,
          board: "FRESH",
          customer: { equals: String(data.customer), mode: "insensitive" },
          product: { equals: String(data.product), mode: "insensitive" },
          poDate: (data.poDate as Date | undefined) ?? null,
        },
        select: { requestNo: true },
      });
      if (dup) return { ok: false, error: "duplicate", duplicateOf: String(dup.requestNo ?? "—") };
    }
    const stage: Stage = advance ? stageAfter(advance) : "DEMAND_PENDING";
    const held = daysInFreshPo({ poDate: data.poDate as Date | undefined, createdAt: new Date() }) > LONG_HOLD_DAYS;
    const board = held ? "LONG_HOLD" : "FRESH";
    const created = await withSerial("board", async (tx) => {
      const requestNo = await nextRequestNo(tx, board);
      const po = await tx.freshPo.create({ data: { ...(data as Prisma.FreshPoUncheckedCreateInput), stage, board, requestNo } });
      await recordChange(
        {
          userId: user.id,
          entityType: ENTITY,
          entityId: po.id,
          action: "created",
          message: `${TEAM_LABELS[team]} created PO #${requestNo} at stage “${STAGES[stage].label}”${held ? ` — moved straight to Long Hold (PO date over ${LONG_HOLD_DAYS} days ago)` : ""}`,
        },
        tx,
      );
      return po;
    });
    refresh();
    return { ok: true, id: created.id, requestNo: String(created.requestNo ?? ""), board: created.board, held };
  }

  const stage: Stage = advance ? stageAfter(advance) : earlierStage(before.stage, deriveStage(merged));
  const after = await db.$transaction(async (tx) => {
    const po = await tx.freshPo.update({ where: { id: before.id }, data: { ...(data as Prisma.FreshPoUncheckedUpdateInput), stage } });
    await recordChange(
      {
        userId: user.id,
        entityType: ENTITY,
        entityId: po.id,
        action: advance ? "submitted" : "updated",
        message: advance ? `${TEAM_LABELS[team]} submitted — stage → ${STAGES[stage].label}` : `${TEAM_LABELS[team]} saved changes`,
        changes: diff(tracked(before), tracked(po)),
      },
      tx,
    );
    return po;
  });
  refresh();
  return { ok: true, id: after.id, requestNo: String(after.requestNo ?? ""), board: after.board, held: false };
}

// ─── Moves ──────────────────────────────────────────────────────────────────

const idsSchema = z.array(z.string()).min(1).max(1000);

/** Moves ticked POs to Long Hold, or returns them from Long Hold to Fresh PO (each takes the next number there). */
export async function movePos(ids: string[], to: "FRESH" | "LONG_HOLD"): Promise<SimpleResult> {
  const user = await requireUser("b2bOrders", "edit");
  const list = idsSchema.safeParse(ids);
  if (!list.success || (to !== "FRESH" && to !== "LONG_HOLD")) return fail("Nothing to move.");
  const from: BoardKind = to === "LONG_HOLD" ? "FRESH" : "LONG_HOLD";
  const moved = await withSerial("board", async (tx) => {
    let n = 0;
    for (const id of list.data) {
      const before = await tx.freshPo.findFirst({ where: { id, board: from, deletedAt: null } });
      if (!before) continue;
      await moveToBoard(tx, before, to, user.id, to === "LONG_HOLD" ? "Moved to Long Hold PO" : "Returned from Long Hold PO to Fresh PO");
      n++;
    }
    return n;
  });
  refresh();
  return { ok: true, message: `${moved} PO${moved === 1 ? "" : "s"} ${to === "LONG_HOLD" ? "moved to Long Hold PO" : "returned to Fresh PO"}.` };
}

/** Sends a ready PO on to Domestic MIS as a new job. */
export async function moveToMis(id: string): Promise<SimpleResult> {
  const user = await requireUser("b2bOrders", "edit");
  try {
    const jobNo = await db.$transaction(async (tx) => {
      const po = await tx.freshPo.findFirst({ where: { id, deletedAt: null } });
      if (!po) throw new Error("This PO no longer exists.");
      if (po.board !== "FRESH") throw new Error(`${label(po)} isn’t on the Fresh PO board.`);
      if (!canMoveToMis(po.stage, poValues(po))) throw new Error(`${label(po)} still has pending details.`);
      const job = await createMisJobFromFreshPo(tx, po, user.id);
      await recordChange(
        {
          userId: user.id,
          entityType: ENTITY,
          entityId: po.id,
          action: "moved",
          message: `Moved to Domestic MIS → Job ${job.jobNo}`,
          changes: { board: [po.board, "MIS"] },
        },
        tx,
      );
      return job.jobNo;
    });
    refresh();
    revalidatePath("/b2b/mis");
    return { ok: true, message: `Moved to Domestic MIS as Job ${jobNo}.` };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The PO wasn’t moved.");
  }
}

/** Brings a PO back from Domestic MIS: its MIS job goes to Archives and the PO takes the next Fresh PO number. */
export async function returnFromMis(id: string): Promise<SimpleResult> {
  const user = await requireUser("b2bOrders", "edit");
  try {
    const result = await withSerial("board", async (tx) => {
      const po = await tx.freshPo.findFirst({ where: { id, deletedAt: null, board: "MIS" } });
      if (!po) throw new Error("This PO isn’t in Domestic MIS any more.");
      const job = po.misJobId ? await tx.misJob.findFirst({ where: { id: po.misJobId, source: "fresh-po", deletedAt: null } }) : null;
      if (job) {
        await tx.misJob.update({ where: { id: job.id }, data: { deletedAt: new Date() } });
        await recordChange(
          { userId: user.id, entityType: "MisJob", entityId: job.id, action: "deleted", message: `Job ${job.jobNo} moved to Archives — ${label(po)} returned to Fresh PO` },
          tx,
        );
      }
      const requestNo = await nextRequestNo(tx, "FRESH");
      await tx.freshPo.update({ where: { id: po.id }, data: { board: "FRESH", misJobId: null, requestNo } });
      await recordChange(
        {
          userId: user.id,
          entityType: ENTITY,
          entityId: po.id,
          action: "moved",
          message: `Returned from Domestic MIS${job ? ` (Job ${job.jobNo})` : ""} to Fresh PO`,
          changes: { board: ["MIS", "FRESH"], requestNo: [po.requestNo, requestNo] },
        },
        tx,
      );
      return requestNo;
    });
    refresh();
    revalidatePath("/b2b/mis");
    return { ok: true, message: `Returned to Fresh PO as PO #${result}.` };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The PO wasn’t returned.");
  }
}

/** Soft delete: kept in Archives for 3 days. */
export async function deletePos(ids: string[]): Promise<SimpleResult> {
  const user = await requireUser("b2bOrders", "edit");
  const list = idsSchema.safeParse(ids);
  if (!list.success) return fail("Nothing to delete.");
  let n = 0;
  for (const id of list.data) {
    const done = await db.$transaction(async (tx) => {
      const res = await tx.freshPo.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
      if (!res.count) return false;
      await recordChange({ userId: user.id, entityType: ENTITY, entityId: id, action: "deleted", message: "Moved to Archives" }, tx);
      return true;
    });
    if (done) n++;
  }
  refresh();
  return { ok: true, message: `${n} PO${n === 1 ? "" : "s"} moved to Archives.` };
}

// ─── Import ─────────────────────────────────────────────────────────────────

export type ImportPreview =
  | { ok: true; file: string; sheet: string; rows: SheetRow[]; columns: SheetColumn[]; skipped: string[]; existing: number; truncated: boolean }
  | { ok: false; error: string };

type LivePo = Record<string, string> & { id: string; board: BoardKind; stage: Stage; requestNo: string };

function livePo(po: FreshPo): LivePo {
  return { ...poValues(po), id: po.id, board: po.board, stage: po.stage, requestNo: po.requestNo === null ? "" : String(po.requestNo) };
}

/** Reads an uploaded CSV / XLSX and reports what an import would do. */
export async function previewImport(formData: FormData): Promise<ImportPreview> {
  await requireUser("b2bOrders", "edit");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a CSV or Excel file.");
  if (file.size > MAX_UPLOAD) return fail("That file is over 25 MB.");
  try {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", raw: true, cellDates: false });
    const sheets: Record<string, unknown[][]> = {};
    for (const name of wb.SheetNames) {
      sheets[name] = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" });
    }
    const parsed = parseFreshPoSheet(sheets);
    const rows = parsed.rows.slice(0, IMPORT_MAX_ROWS);
    const live = (await db.freshPo.findMany({ where: { deletedAt: null } })).map(livePo);
    const existing = rows.filter((r) => matchPo(live, r)).length;
    return { ok: true, file: file.name, sheet: parsed.sheet, rows, columns: parsed.columns, skipped: parsed.skipped, existing, truncated: parsed.rows.length > rows.length };
  } catch (e) {
    return fail(`Couldn’t read that file: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export type ImportResult = { ok: true; added: number; updated: number; same: number; held: number } | { ok: false; error: string };

/**
 * Imports sheet rows. A row that is a PO already here (see samePo) fills that
 * PO's changed, non-blank fields (a PO already in Domestic MIS is left alone);
 * any other row is a new PO with the next Request No. on its board: Long Hold
 * when imported there or when its PO date is already past the limit.
 */
export async function runImport(rowsIn: SheetRow[], board: "FRESH" | "LONG_HOLD", fileName: string): Promise<ImportResult> {
  const user = await requireUser("b2bOrders", "edit");
  const rowsParsed = z.array(z.record(z.string(), z.string())).safeParse(rowsIn);
  if (!rowsParsed.success) return fail("The sheet rows could not be read.");
  const rows = rowsParsed.data.slice(0, IMPORT_MAX_ROWS);
  if (!rows.length) return fail("The sheet has no rows.");
  const onLongHold = board === "LONG_HOLD";
  const source = String(fileName || "a sheet").slice(0, 120);

  let added = 0;
  let updated = 0;
  let same = 0;
  let held = 0;
  const live = (await db.freshPo.findMany({ where: { deletedAt: null } })).map(livePo);

  for (const r of rows) {
    const row = cleanRow(r);
    if (!Object.keys(row).length) continue;
    const cur = matchPo(live, row);
    if (cur) {
      if (cur.board === "MIS") {
        same++;
        continue;
      }
      const changes = importChanges(cur, row);
      const { data } = toData(changes, true);
      for (const k of Object.keys(data)) if (data[k] === null) delete data[k];
      if (!Object.keys(data).length) {
        same++;
        continue;
      }
      const merged = { ...cur, ...changes };
      const stage = cur.board === "FRESH" ? deriveStage(merged) : cur.stage;
      await db.$transaction(async (tx) => {
        const before = await tx.freshPo.findUniqueOrThrow({ where: { id: cur.id } });
        const after = await tx.freshPo.update({ where: { id: cur.id }, data: { ...(data as Prisma.FreshPoUncheckedUpdateInput), stage } });
        await recordChange(
          { userId: user.id, entityType: ENTITY, entityId: cur.id, action: "updated", message: `Updated from ${source}`, changes: diff(tracked(before), tracked(after)) },
          tx,
        );
        Object.assign(cur, livePo(after));
      });
      updated++;
    } else {
      const fields = { ...row };
      delete fields.requestNo;
      const total = fields.totalTaxable || computeTotal(fields.qtyToDispatch, fields.rate);
      if (total) fields.totalTaxable = total;
      const { data } = toData(fields, true);
      const old = !onLongHold && daysInFreshPo({ poDate: data.poDate as Date | undefined, createdAt: new Date() }) > LONG_HOLD_DAYS;
      const target = onLongHold || old ? "LONG_HOLD" : "FRESH";
      const stage = deriveStage({ businessLeg: "B2B", movementType: "Forward", ...fields });
      const po = await withSerial("board", async (tx) => {
        const requestNo = await nextRequestNo(tx, target);
        const created = await tx.freshPo.create({ data: { ...(data as Prisma.FreshPoUncheckedCreateInput), requestNo, board: target, stage } });
        await recordChange(
          {
            userId: user.id,
            entityType: ENTITY,
            entityId: created.id,
            action: "created",
            message: `Imported from ${source}${onLongHold ? " onto Long Hold" : old ? ` — moved straight to Long Hold (PO date over ${LONG_HOLD_DAYS} days ago)` : ""}`,
          },
          tx,
        );
        return created;
      });
      live.push(livePo(po));
      if (old) held++;
      added++;
    }
  }
  refresh();
  return { ok: true, added, updated, same, held };
}

// ─── Documents ──────────────────────────────────────────────────────────────

export async function listPoDocs(poId: string): Promise<DocItem[]> {
  await requireUser("b2bOrders", "view");
  const files = await db.opsFile.findMany({ where: { entityType: ENTITY, entityId: poId }, orderBy: { createdAt: "asc" } });
  return files.map((f) => ({
    id: f.id,
    field: f.field,
    fileName: f.fileName,
    contentType: f.contentType,
    size: f.size,
    url: f.storageKey ? fileUrl(f.storageKey) : (f.url ?? ""),
    downloadUrl: f.storageKey ? fileUrl(f.storageKey, true) : (f.url ?? ""),
    createdAt: f.createdAt.toISOString(),
  }));
}

/** FormData: poId, kind (PO | PI | COA | MSDS | OTHER), file. */
export async function uploadPoDoc(formData: FormData): Promise<SimpleResult> {
  const user = await requireUser("b2bOrders", "edit");
  const poId = String(formData.get("poId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const file = formData.get("file");
  if (!(FRESH_PO_DOC_KINDS as readonly string[]).includes(kind)) return fail("Unknown document type.");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file.");
  if (file.size > MAX_UPLOAD) return fail("Files can be at most 25 MB.");
  const po = await db.freshPo.findFirst({ where: { id: poId, deletedAt: null }, select: { id: true } });
  if (!po) return fail("This PO no longer exists.");
  const saved = await saveFile(file, `fresh-po/${kind.toLowerCase()}`);
  await db.opsFile.create({
    data: { entityType: ENTITY, entityId: poId, field: kind, fileName: file.name.slice(0, 200), contentType: saved.contentType, size: saved.size, storageKey: saved.key, uploadedById: user.id },
  });
  await recordChange({ userId: user.id, entityType: ENTITY, entityId: poId, action: "file added", message: `${kind}: ${file.name}` });
  refresh();
  return { ok: true };
}

export async function deletePoDoc(fileId: string): Promise<SimpleResult> {
  const user = await requireUser("b2bOrders", "edit");
  const f = await db.opsFile.findFirst({ where: { id: fileId, entityType: ENTITY } });
  if (!f) return fail("That document is already gone.");
  await db.opsFile.delete({ where: { id: f.id } });
  if (f.storageKey) await deleteStoredFile(f.storageKey);
  await recordChange({ userId: user.id, entityType: ENTITY, entityId: f.entityId, action: "file removed", message: `${f.field}: ${f.fileName}` });
  refresh();
  return { ok: true };
}

// ─── History ────────────────────────────────────────────────────────────────

const BOARD_LABELS: Record<string, string> = { FRESH: "Fresh PO", LONG_HOLD: "Long Hold PO", MIS: "Domestic MIS" };

function show(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "∅";
  const s = String(v);
  if (field === "stage" && s in STAGES) return STAGES[s as Stage].label;
  if (field === "board") return BOARD_LABELS[s] ?? s;
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) return formatDmy(s.slice(0, 10));
  return s;
}

export async function poHistory(poId: string): Promise<HistoryItem[]> {
  await requireUser("b2bOrders", "view");
  const logs = await db.activity.findMany({
    where: { entityType: ENTITY, entityId: poId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    message: l.message,
    who: l.user?.name ?? "System",
    at: l.updatedAt.toISOString(),
    changes: Object.entries((l.changes as Record<string, [unknown, unknown]> | null) ?? {}).map(([field, pair]) => ({
      field: fieldLabel(field),
      from: show(field, Array.isArray(pair) ? pair[0] : null),
      to: show(field, Array.isArray(pair) ? pair[1] : pair),
    })),
  }));
}

// ─── Quick-add masters ──────────────────────────────────────────────────────

const contactSchema = z.object({
  role: z.enum(["CUSTOMER", "SUPPLIER"]),
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(2000).optional(),
  pincode: z.string().trim().max(20).optional(),
  poc: z.string().trim().max(300).optional(),
});

/** Creates a minimal Contact (or adds the role to an existing one with that name). */
export async function quickAddContact(input: z.input<typeof contactSchema>): Promise<{ ok: true; option: ContactOption } | { ok: false; error: string }> {
  const user = await requireUser("contacts", "edit");
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return fail("Enter a name.");
  const { role, name, address, pincode, poc } = parsed.data;
  const contact = await db.$transaction(async (tx) => {
    const existing = await tx.contact.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (existing) {
      const data: Prisma.ContactUpdateInput = {};
      if (!existing.roles.includes(role)) data.roles = [...existing.roles, role];
      if (poc && !existing.pocNames.includes(poc)) data.pocNames = [...existing.pocNames, poc];
      if (address && !existing.billingAddress) data.billingAddress = address;
      if (pincode && !existing.pincode) data.pincode = pincode;
      if (!Object.keys(data).length) return existing;
      const after = await tx.contact.update({ where: { id: existing.id }, data });
      await recordChange({ userId: user.id, entityType: "Contact", entityId: existing.id, action: "updated", message: `Contact ${after.name} updated from Fresh PO`, changes: diff(existing, after) }, tx);
      return after;
    }
    const code = await nextDocumentNumber(tx, "CONTACT");
    const created = await tx.contact.create({
      data: { code, name, roles: [role], pocNames: poc ? [poc] : [], billingAddress: address || null, pincode: pincode || null },
    });
    await recordChange({ userId: user.id, entityType: "Contact", entityId: created.id, action: "created", message: `Contact ${name} added from Fresh PO` }, tx);
    return created;
  });
  revalidatePath("/contacts");
  refresh();
  const addresses = [...new Set([contact.billingAddress, contact.shippingAddress].filter((a): a is string => !!a?.trim()))];
  return { ok: true, option: { id: contact.id, name: contact.name, pocs: contact.pocNames, addresses } };
}

const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  productClass: z.string().trim().max(40).optional(),
  hsnCode: z.string().trim().max(20).optional(),
  casNo: z.string().trim().max(40).optional(),
});

/** Creates a minimal Product (or returns the one with that name). */
export async function quickAddProduct(input: z.input<typeof productSchema>): Promise<{ ok: true; option: ProductOption } | { ok: false; error: string }> {
  const user = await requireUser("products", "edit");
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return fail("Enter a name.");
  const { name, productClass, hsnCode, casNo } = parsed.data;
  const product = await db.$transaction(async (tx) => {
    const existing = await tx.product.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (existing) return existing;
    const base = `B2B-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "ITEM"}`;
    let sku = base;
    for (let i = 2; await tx.product.findUnique({ where: { sku }, select: { id: true } }); i++) sku = `${base}-${i}`;
    const created = await tx.product.create({
      data: { sku, name, unit: "kg", productClass: productClass || null, hsnCode: hsnCode || null, casNo: casNo || null },
    });
    await recordChange({ userId: user.id, entityType: "Product", entityId: created.id, action: "created", message: `Product ${sku} ${name} added from Fresh PO` }, tx);
    return created;
  });
  revalidatePath("/inventory/products");
  refresh();
  return { ok: true, option: { id: product.id, name: product.name, productClass: product.productClass ?? "", hsnCode: product.hsnCode ?? "" } };
}
