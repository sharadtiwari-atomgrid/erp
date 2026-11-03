"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import type { Prisma } from "@/generated/prisma/client";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";
import { todayIso } from "@/lib/ops/dates";
import { MIS_DOC_FIELDS, MIS_STATUS_LABELS } from "@/lib/ops/lists";
import { jobNoTaken, lockSerial, nextJobNo, nextRequestNo, withSerial } from "@/lib/ops/serials";
import { deleteStoredFile, saveFile } from "@/lib/storage";
import { journeyFromMis, type JourneyJob } from "../_shared/journey-data";
import { dataFromValues, normaliseValues, valuesFromJob } from "./_lib/convert";
import { DOC_KEYS, hasContent, POC_KEYS, VALUE_KEYS, type DocKey, type MisValues } from "./_lib/fields";
import { fileList, type MisFile } from "./_lib/files";
import { docStatus, holdGated, problemText, statusProblems, type Problem } from "./_lib/gates";
import { mergeImported, parseMisSheet } from "./_lib/import-map";
import { loadDocs, loadHistory, MIS_ENTITY, type HistoryEntry } from "./_server/data";

const PATH = "/b2b/mis";
const MAX_BYTES = 25 * 1024 * 1024;

type Fail = { ok: false; error: string; problems?: Problem[] };

export type SaveResult =
  | {
      ok: true;
      id: string;
      jobNo: string;
      /** The row as saved (a held status keeps its previous value). */
      values: MisValues;
      /** Gated changes that were held back. */
      held: Problem[];
      notice?: string;
    }
  | Fail;

/** Only known scalar fields, as trimmed-free strings. */
function clean(patch: Record<string, unknown>): MisValues {
  const keys = new Set(VALUE_KEYS);
  const out: MisValues = {};
  for (const [k, v] of Object.entries(patch ?? {})) if (keys.has(k)) out[k] = v === null || v === undefined ? "" : String(v);
  return out;
}

const changedKeys = (a: MisValues, b: MisValues) => Object.keys(b).filter((k) => (a[k] ?? "") !== (b[k] ?? ""));

/** Adds POC names typed on the row to the POC master when they're new. */
async function addPocs(tx: Tx, values: MisValues) {
  const names = [...new Set(POC_KEYS.map((k) => String(values[k] ?? "").trim()).filter(Boolean))];
  if (!names.length) return;
  const existing = await tx.opsPoc.findMany({ where: { OR: names.map((n) => ({ name: { equals: n, mode: "insensitive" as const } })) }, select: { name: true } });
  const have = new Set(existing.map((p) => p.name.toLowerCase()));
  const fresh = names.filter((n) => !have.has(n.toLowerCase()));
  if (fresh.length) await tx.opsPoc.createMany({ data: fresh.map((name) => ({ name })), skipDuplicates: true });
}

const label = (jobNo: string) => (jobNo ? `Job ${jobNo}` : "Job");

/**
 * Create (id = null) or update a job with the fields that changed. A status or
 * payment change whose gate isn't met keeps its previous value; everything else saves.
 */
export async function saveMisJob(id: string | null, patch: Record<string, unknown>): Promise<SaveResult> {
  const user = await requireUser("b2bOrders", "edit");
  const incoming = clean(patch);
  try {
    if (!id) {
      if (!hasContent(incoming)) return { ok: false, error: "Add a customer, product or supplier first." };
      const result = await withSerial("mis", async (tx) => {
        const typed = String(incoming.jobNo ?? "").trim();
        const jobNo = !typed || (await jobNoTaken(tx, typed)) ? await nextJobNo(tx) : typed;
        const { row, problems } = holdGated({ ...incoming, jobNo }, null);
        const created = await tx.misJob.create({
          data: { ...(dataFromValues(row) as Prisma.MisJobUncheckedCreateInput), jobNo, source: "manual" },
        });
        await addPocs(tx, row);
        const renumbered = !typed
          ? `Job No. was blank, so this entry is Job No. ${jobNo}.`
          : typed !== jobNo
            ? `Job No. ${typed} was already used, so this entry is Job No. ${jobNo}.`
            : undefined;
        await recordChange(
          {
            userId: user.id,
            entityType: MIS_ENTITY,
            entityId: created.id,
            action: "created",
            message: typed && typed !== jobNo ? `Job ${jobNo} created (Job No. ${typed} was taken)` : `Job ${jobNo} created`,
          },
          tx,
        );
        return { created, problems, renumbered };
      });
      revalidatePath(PATH);
      return {
        ok: true,
        id: result.created.id,
        jobNo: result.created.jobNo,
        values: valuesFromJob(result.created),
        held: result.problems,
        notice: result.renumbered,
      };
    }

    const result = await db.$transaction(async (tx) => {
      const cur = await tx.misJob.findFirst({ where: { id, deletedAt: null } });
      if (!cur) throw new Error("This job was deleted or doesn't exist.");
      const prev = valuesFromJob(cur);
      const next: MisValues = { ...prev, ...incoming };
      let notice: string | undefined;
      if ("jobNo" in incoming) {
        const typed = String(incoming.jobNo).trim();
        if (cur.source === "fresh-po" || !typed) next.jobNo = prev.jobNo;
        else if (typed !== prev.jobNo && (await jobNoTaken(tx, typed, id))) {
          next.jobNo = prev.jobNo;
          notice = `Job No. ${typed} is already used by another job, so it wasn't changed.`;
        } else next.jobNo = typed;
      }
      const { row, problems } = holdGated(next, prev);
      const saved = normaliseValues(row);
      const keys = changedKeys(prev, saved);
      if (!keys.length) return { job: cur, problems, notice };
      const job = await tx.misJob.update({
        where: { id },
        data: dataFromValues(Object.fromEntries(keys.map((k) => [k, row[k]]))) as Prisma.MisJobUncheckedUpdateInput,
      });
      await addPocs(tx, Object.fromEntries(keys.map((k) => [k, row[k]])));
      const after = valuesFromJob(job);
      const statusMoved = prev.status !== after.status;
      await recordChange(
        {
          userId: user.id,
          entityType: MIS_ENTITY,
          entityId: id,
          action: statusMoved ? "status" : "updated",
          message: statusMoved
            ? `${label(job.jobNo)} marked ${MIS_STATUS_LABELS[job.status!] ?? "no status"}`
            : `${label(job.jobNo)} updated`,
          changes: diff(prev, after),
        },
        tx,
      );
      return { job, problems, notice };
    });
    revalidatePath(PATH);
    return { ok: true, id, jobNo: result.job.jobNo, values: valuesFromJob(result.job), held: result.problems, notice: result.notice };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Row menu: Mark In transit / Delivered, stamping the actual ETD / ETA with today if blank. */
export async function markMisStatus(id: string, status: "INTRANSIT" | "DELIVERED"): Promise<{ ok: true } | Fail> {
  const user = await requireUser("b2bOrders", "edit");
  const cur = await db.misJob.findFirst({ where: { id, deletedAt: null } });
  if (!cur) return { ok: false, error: "This job was deleted or doesn't exist." };
  const prev = valuesFromJob(cur);
  const next: MisValues = { ...prev, status };
  if (status === "INTRANSIT" && !next.actualEtd) next.actualEtd = todayIso();
  if (status === "DELIVERED" && !next.actualEta) next.actualEta = todayIso();
  const problems = statusProblems(next, prev);
  if (problems.length) return { ok: false, error: problemText(problems), problems };
  const keys = changedKeys(prev, next);
  const job = await db.misJob.update({
    where: { id },
    data: dataFromValues(Object.fromEntries(keys.map((k) => [k, next[k]]))) as Prisma.MisJobUncheckedUpdateInput,
  });
  await recordChange({
    userId: user.id,
    entityType: MIS_ENTITY,
    entityId: id,
    action: "status",
    message: `${label(job.jobNo)} marked ${MIS_STATUS_LABELS[status]}`,
    changes: diff(prev, valuesFromJob(job)),
  });
  revalidatePath(PATH);
  return { ok: true };
}

/** Soft delete (kept in Archives). */
export async function deleteMisJob(id: string): Promise<{ ok: true } | Fail> {
  const user = await requireUser("b2bOrders", "edit");
  const cur = await db.misJob.findFirst({ where: { id, deletedAt: null }, select: { jobNo: true } });
  if (!cur) return { ok: false, error: "This job was already deleted." };
  await db.misJob.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordChange({ userId: user.id, entityType: MIS_ENTITY, entityId: id, action: "deleted", message: `${label(cur.jobNo)} moved to Archives` });
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Send a job that came from Fresh PO back there: the PO returns to the Fresh PO board
 * with that board's next Request No., its link is cleared, and the job is soft-deleted.
 */
export async function moveMisJobBackToFreshPo(id: string): Promise<{ ok: true; requestNo: number } | Fail> {
  const user = await requireUser("b2bOrders", "edit");
  try {
    const requestNo = await withSerial("board", async (tx) => {
      const job = await tx.misJob.findFirst({ where: { id, deletedAt: null } });
      if (!job) throw new Error("This job was deleted or doesn't exist.");
      if (job.source !== "fresh-po") throw new Error("This job didn't come from Fresh PO, so it can't be moved back.");
      const po = await tx.freshPo.findFirst({ where: { misJobId: id } });
      if (!po) throw new Error("The Fresh PO this job came from can't be found, so it can't be moved back.");
      const no = await nextRequestNo(tx, "FRESH");
      await tx.freshPo.update({ where: { id: po.id }, data: { board: "FRESH", misJobId: null, requestNo: no } });
      await tx.misJob.update({ where: { id }, data: { deletedAt: new Date() } });
      await recordChange(
        {
          userId: user.id,
          entityType: "FreshPo",
          entityId: po.id,
          action: "moved",
          message: `Returned from Domestic MIS (Job ${job.jobNo}) to Fresh PO as #${no}`,
          changes: { board: ["MIS", "FRESH"], requestNo: [po.requestNo, no] },
        },
        tx,
      );
      await recordChange(
        { userId: user.id, entityType: MIS_ENTITY, entityId: id, action: "deleted", message: `${label(job.jobNo)} moved back to Fresh PO #${no}` },
        tx,
      );
      return no;
    });
    revalidatePath(PATH);
    revalidatePath("/b2b/fresh-po");
    return { ok: true, requestNo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type FilesResult =
  | { ok: true; files: MisFile[]; status: string; note?: string; problems?: Problem[] }
  | Fail;

const isDocKey = (k: string): k is DocKey => (DOC_KEYS as string[]).includes(k);

/**
 * Upload one or more files to a document field (re-uploading adds a file). The first
 * POD moves the job to Delivered, the first E-Way Bill to In transit, when the gates allow.
 */
export async function uploadMisFiles(id: string, field: string, formData: FormData): Promise<FilesResult> {
  const user = await requireUser("b2bOrders", "edit");
  if (!isDocKey(field)) return { ok: false, error: "Unknown document field." };
  const picked = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!picked.length) return { ok: false, error: "Choose a file to upload." };
  const big = picked.find((f) => f.size > MAX_BYTES);
  if (big) return { ok: false, error: `${big.name} is larger than 25 MB.` };
  const job = await db.misJob.findFirst({ where: { id, deletedAt: null } });
  if (!job) return { ok: false, error: "Save the entry before adding documents." };

  const before = await db.opsFile.count({ where: { entityType: MIS_ENTITY, entityId: id, field } });
  const stored: Array<{ key: string; size: number; contentType: string; name: string }> = [];
  try {
    for (const f of picked) stored.push({ ...(await saveFile(f, `mis/${field}`)), name: f.name });
  } catch (e) {
    await Promise.all(stored.map((s) => deleteStoredFile(s.key)));
    return { ok: false, error: `Not uploaded: ${e instanceof Error ? e.message : String(e)}` };
  }

  const prev = valuesFromJob(job);
  const target = docStatus(field, job.status, before > 0);
  const problems = target ? statusProblems({ ...prev, status: target }, prev) : [];
  const moveTo = target && !problems.length ? target : null;
  const docLabel = MIS_DOC_FIELDS[field];

  await db.$transaction(async (tx) => {
    await tx.opsFile.createMany({
      data: stored.map((s) => ({
        entityType: MIS_ENTITY,
        entityId: id,
        field,
        fileName: s.name,
        contentType: s.contentType,
        size: s.size,
        storageKey: s.key,
        uploadedById: user.id,
      })),
    });
    if (moveTo) await tx.misJob.update({ where: { id }, data: { status: moveTo } });
    await recordChange(
      {
        userId: user.id,
        entityType: MIS_ENTITY,
        entityId: id,
        action: moveTo ? "status" : "updated",
        message: `${docLabel} uploaded on ${label(job.jobNo)}${moveTo ? `: status set to ${MIS_STATUS_LABELS[moveTo]}` : ""}`,
        changes: {
          [field]: [null, stored.map((s) => s.name).join(", ")],
          ...(moveTo ? { status: [prev.status || null, moveTo] } : {}),
        },
      },
      tx,
    );
  });

  const docs = await loadDocs(id);
  let note: string | undefined;
  if (moveTo === "DELIVERED") note = "POD uploaded: status set to Delivered.";
  else if (moveTo === "INTRANSIT") note = "E-Way Bill uploaded: status set to In transit.";
  else if (target) note = `${docLabel} uploaded. ${problemText(problems)}`;
  revalidatePath(PATH);
  return { ok: true, files: docs[field] ?? [], status: moveTo ?? prev.status, note, problems: problems.length ? problems : undefined };
}

/** Remove one file from a document field (and from storage). */
export async function removeMisFile(fileId: string): Promise<FilesResult> {
  const user = await requireUser("b2bOrders", "edit");
  const file = await db.opsFile.findFirst({ where: { id: fileId, entityType: MIS_ENTITY } });
  if (!file) return { ok: false, error: "That file was already removed." };
  const job = await db.misJob.findUnique({ where: { id: file.entityId }, select: { jobNo: true, status: true } });
  await db.opsFile.delete({ where: { id: fileId } });
  if (file.storageKey) await deleteStoredFile(file.storageKey);
  await recordChange({
    userId: user.id,
    entityType: MIS_ENTITY,
    entityId: file.entityId,
    action: "updated",
    message: `${MIS_DOC_FIELDS[file.field as DocKey] ?? file.field} file removed on ${label(job?.jobNo ?? "")}`,
    changes: { [file.field]: [file.fileName, null] },
  });
  const docs = await loadDocs(file.entityId);
  revalidatePath(PATH);
  return { ok: true, files: docs[file.field as DocKey] ?? [], status: job?.status ?? "" };
}

export async function getMisHistory(id: string): Promise<HistoryEntry[]> {
  await requireUser("b2bOrders");
  return loadHistory(id);
}

export async function getMisJourney(id: string): Promise<JourneyJob | null> {
  await requireUser("b2bOrders");
  const job = await db.misJob.findFirst({ where: { id, deletedAt: null } });
  if (!job) return null;
  const files = await db.opsFile.findMany({ where: { entityType: MIS_ENTITY, entityId: id }, orderBy: { createdAt: "asc" } });
  return journeyFromMis(job, files);
}

export type ImportState = { error?: string; success?: string; added?: number; updated?: number; total?: number } | undefined;

/** Read the first sheet that has a "Job No." header. */
function readSheet(buf: ArrayBuffer, name: string): unknown[][] {
  const csv = /\.(csv|txt)$/i.test(name);
  const wb = csv ? XLSX.read(new TextDecoder().decode(buf), { type: "string", raw: true }) : XLSX.read(buf, { type: "array" });
  let first: unknown[][] | null = null;
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: true, defval: "", blankrows: false });
    first ??= rows;
    if (rows.some((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim().toLowerCase() === "job no."))) return rows;
  }
  return first ?? [];
}

const CHUNK = 100;

/**
 * Import the master sheet (CSV / XLSX). Upsert by Job No.: an existing live job is
 * merged (only non-blank cells overwrite; its source is kept); otherwise a job is
 * created with source "import".
 */
export async function importMisSheet(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireUser("b2bOrders", "edit");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a CSV or Excel file." };
  if (file.size > MAX_BYTES) return { error: "That file is larger than 25 MB." };
  let parsed;
  try {
    parsed = parseMisSheet(readSheet(await file.arrayBuffer(), file.name));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (!parsed.length) return { error: "No rows with a Job No. found in that file." };

  let added = 0;
  let updated = 0;
  try {
    for (let i = 0; i < parsed.length; i += CHUNK) {
      const chunk = parsed.slice(i, i + CHUNK);
      await db.$transaction(
        async (tx) => {
          await lockSerial(tx, "mis");
          const jobNos = [...new Set(chunk.map((r) => r.values.jobNo))];
          const existing = await tx.misJob.findMany({ where: { jobNo: { in: jobNos }, deletedAt: null }, orderBy: { createdAt: "asc" } });
          const byNo = new Map(existing.map((j) => [j.jobNo, j]));
          for (const { values, docs } of chunk) {
            const cur = byNo.get(values.jobNo);
            let jobId: string;
            if (cur) {
              const prev = valuesFromJob(cur);
              const merged = normaliseValues(mergeImported(prev, values));
              const keys = changedKeys(prev, merged);
              let after = prev;
              if (keys.length) {
                const job = await tx.misJob.update({
                  where: { id: cur.id },
                  data: dataFromValues(Object.fromEntries(keys.map((k) => [k, merged[k]]))) as Prisma.MisJobUncheckedUpdateInput,
                });
                after = valuesFromJob(job);
              }
              jobId = cur.id;
              updated++;
              const changes = diff(prev, after);
              if (Object.keys(changes).length)
                await recordChange(
                  { userId: user.id, entityType: MIS_ENTITY, entityId: jobId, action: "imported", message: `Job ${cur.jobNo} updated by sheet import`, changes },
                  tx,
                );
            } else {
              const job = await tx.misJob.create({
                data: { ...(dataFromValues(values) as Prisma.MisJobUncheckedCreateInput), jobNo: values.jobNo, source: "import" },
              });
              byNo.set(job.jobNo, job);
              jobId = job.id;
              added++;
              await recordChange(
                { userId: user.id, entityType: MIS_ENTITY, entityId: jobId, action: "imported", message: `Job ${job.jobNo} added by sheet import` },
                tx,
              );
            }
            // Document references in the sheet (text or links) become file entries, once each.
            const refs = Object.entries(docs) as Array<[DocKey, string]>;
            if (refs.length) {
              const have = await tx.opsFile.findMany({ where: { entityType: MIS_ENTITY, entityId: jobId }, select: { field: true, fileName: true, url: true } });
              const seen = new Set(have.map((h) => `${h.field}\u0000${h.url ?? h.fileName}`));
              const data = refs.flatMap(([field, ref]) =>
                fileList(ref)
                  .filter((f) => !seen.has(`${field}\u0000${f.url ?? f.name}`))
                  .map((f) => ({ entityType: MIS_ENTITY, entityId: jobId, field, fileName: f.name, url: f.url ?? null, uploadedById: user.id })),
              );
              if (data.length) await tx.opsFile.createMany({ data });
            }
          }
        },
        { timeout: 120_000, maxWait: 20_000 },
      );
    }
  } catch (e) {
    revalidatePath(PATH);
    return { error: `Import stopped after ${added + updated} rows: ${e instanceof Error ? e.message : String(e)}`, added, updated, total: parsed.length };
  }
  await recordChange({
    userId: user.id,
    entityType: "MisImport",
    entityId: "domestic-mis",
    action: "imported",
    message: `Domestic MIS sheet import (${file.name}): ${added} added, ${updated} updated (${parsed.length} rows)`,
  });
  revalidatePath(PATH);
  return { success: `Imported ${parsed.length} job numbers: ${added} added, ${updated} updated.`, added, updated, total: parsed.length };
}
