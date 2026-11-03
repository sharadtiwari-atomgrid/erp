import "server-only";
import { db } from "@/lib/db";
import { formatDmy } from "@/lib/ops/dates";
import { checkRow, type MasterNames } from "../_lib/checks";
import { valuesFromJob } from "../_lib/convert";
import { DOC_KEYS, FIELD_BY_KEY, labelOf, statusLabel, type DocKey, type MisValues } from "../_lib/fields";
import type { MisFile } from "../_lib/files";
import { matchesSearch, sortByJobNo } from "../_lib/list";
import { loadStockLines } from "@/lib/batch-inventory/server";
import { batchesInStock, type BatchInStock } from "../_lib/batches";

export const MIS_ENTITY = "MisJob";

/** Customer / supplier / product names for the pickers and checks, plus the POC master. */
export async function loadMasters(): Promise<{ masters: Required<MasterNames>; pocs: string[] }> {
  const [contacts, products, pocs] = await Promise.all([
    db.contact.findMany({ where: { roles: { hasSome: ["CUSTOMER", "SUPPLIER"] } }, select: { name: true, roles: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    db.opsPoc.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  const uniq = (l: string[]) => [...new Set(l.map((s) => s.trim()).filter(Boolean))];
  return {
    masters: {
      customers: uniq(contacts.filter((c) => c.roles.includes("CUSTOMER")).map((c) => c.name)),
      suppliers: uniq(contacts.filter((c) => c.roles.includes("SUPPLIER")).map((c) => c.name)),
      products: uniq(products.map((p) => p.name)),
    },
    pocs: uniq(pocs.map((p) => p.name)),
  };
}

export type ListRow = {
  id: string;
  jobNo: string;
  source: string;
  requestNo: number | null;
  poDate: string;
  customer: string;
  productName: string;
  supplier: string;
  quantityKgs: string;
  status: string;
  plannedEtd: string;
  plannedEta: string;
  batchNo: string;
  transporterDetails: string;
  logisticsPoc: string;
  issues: number;
};

/** Every live job with its values, files by field and the Fresh PO it came from. */
export async function loadLiveJobs() {
  const [jobs, files] = await Promise.all([
    db.misJob.findMany({ where: { deletedAt: null }, include: { freshPo: { select: { requestNo: true } } } }),
    db.opsFile.findMany({
      where: { entityType: MIS_ENTITY },
      select: { entityId: true, field: true, fileName: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const filesBy = new Map<string, Partial<Record<DocKey, string[]>>>();
  for (const f of files) {
    const m = filesBy.get(f.entityId) ?? {};
    (m[f.field as DocKey] ||= []).push(f.fileName);
    filesBy.set(f.entityId, m);
  }
  return sortByJobNo(
    jobs.map((j) => ({
      id: j.id,
      jobNo: j.jobNo,
      source: j.source,
      requestNo: j.freshPo?.requestNo ?? null,
      values: valuesFromJob(j),
      files: filesBy.get(j.id) ?? {},
    })),
  );
}

export type LiveJob = Awaited<ReturnType<typeof loadLiveJobs>>[number];

export function issuesOf(j: LiveJob, masters: MasterNames) {
  return checkRow(j.values, masters, { pod: (j.files.pod ?? []).map((name) => ({ name })) });
}

export function toListRow(j: LiveJob, masters: MasterNames): ListRow {
  const v = j.values;
  return {
    id: j.id,
    jobNo: j.jobNo,
    source: j.source,
    requestNo: j.requestNo,
    poDate: v.poDate,
    customer: v.customer,
    productName: v.productName,
    supplier: v.supplier,
    quantityKgs: v.quantityKgs,
    status: v.status,
    plannedEtd: v.plannedEtd,
    plannedEta: v.plannedEta,
    batchNo: v.batchNo,
    transporterDetails: v.transporterDetails,
    logisticsPoc: v.logisticsPoc,
    issues: issuesOf(j, masters).length,
  };
}

/** The rows the list shows (and the export downloads): needs-attention filter, then search. */
export function filterJobs(jobs: LiveJob[], masters: MasterNames, q: string, onlyIssues: boolean) {
  return jobs.filter((j) => (!onlyIssues || issuesOf(j, masters).length > 0) && matchesSearch({ ...j.values, jobNo: j.jobNo }, q));
}

/** Suggested Job No. for a new entry (the server assigns the real one on save). */
export async function suggestJobNo(): Promise<string> {
  const [row] = await db.$queryRaw<Array<{ m: bigint | number | null }>>`
    SELECT COALESCE(MAX("jobNo"::bigint), 0) AS m FROM "MisJob" WHERE "jobNo" ~ '^[0-9]{1,15}$'`;
  return String(Number(row?.m ?? 0) + 1);
}

export type EditorJob = {
  id: string;
  jobNo: string;
  source: string;
  requestNo: number | null;
  values: MisValues;
  docs: Partial<Record<DocKey, MisFile[]>>;
};

export function fileOf(f: { id: string; fileName: string; storageKey: string | null; url: string | null; createdAt: Date }): MisFile {
  return { id: f.id, name: f.fileName, key: f.storageKey, url: f.url, at: f.createdAt.toISOString() };
}

export async function loadDocs(jobId: string): Promise<Partial<Record<DocKey, MisFile[]>>> {
  const files = await db.opsFile.findMany({ where: { entityType: MIS_ENTITY, entityId: jobId }, orderBy: { createdAt: "asc" } });
  const docs: Partial<Record<DocKey, MisFile[]>> = {};
  for (const f of files) if ((DOC_KEYS as string[]).includes(f.field)) (docs[f.field as DocKey] ||= []).push(fileOf(f));
  return docs;
}

/** A live job by id or Job No. */
export async function loadEditorJob(idOrJobNo: string): Promise<EditorJob | null> {
  const job =
    (await db.misJob.findFirst({ where: { id: idOrJobNo, deletedAt: null }, include: { freshPo: { select: { requestNo: true } } } })) ??
    (await db.misJob.findFirst({
      where: { jobNo: idOrJobNo, deletedAt: null },
      include: { freshPo: { select: { requestNo: true } } },
      orderBy: { createdAt: "desc" },
    }));
  if (!job) return null;
  return {
    id: job.id,
    jobNo: job.jobNo,
    source: job.source,
    requestNo: job.freshPo?.requestNo ?? null,
    values: valuesFromJob(job),
    docs: await loadDocs(job.id),
  };
}

export type HistoryEntry = {
  id: string;
  action: string;
  message: string;
  at: string;
  who: string | null;
  changes: Array<{ field: string; from: string; to: string }>;
};

const show = (key: string, v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.map(String).join(", ") || "—";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  if (key === "status") return statusLabel(s) || s;
  if (FIELD_BY_KEY[key]?.type === "date" && /^\d{4}-\d{2}-\d{2}/.test(s)) return formatDmy(s.slice(0, 10));
  if (FIELD_BY_KEY[key]?.type === "datetime" && /^\d{4}-\d{2}-\d{2}T/.test(s)) return `${formatDmy(s.slice(0, 10))} ${s.slice(11, 16)}`;
  return s;
};

/** Change history from the activity log, newest first. */
export async function loadHistory(jobId: string): Promise<HistoryEntry[]> {
  const rows = await db.activity.findMany({
    where: { entityType: MIS_ENTITY, entityId: jobId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    message: r.message,
    at: r.updatedAt.toISOString(),
    who: r.user?.name ?? null,
    changes: Object.entries((r.changes as Record<string, [unknown, unknown]> | null) ?? {}).map(([k, pair]) => ({
      field: labelOf(k),
      from: show(k, Array.isArray(pair) ? pair[0] : null),
      to: show(k, Array.isArray(pair) ? pair[1] : null),
    })),
  }));
}

/** Batches with stock, for the Batch No. picker. */
export async function loadBatches(): Promise<BatchInStock[]> {
  try {
    return batchesInStock(await loadStockLines());
  } catch (e) {
    console.error("MIS batch picker: stock couldn't be loaded", e);
    return [];
  }
}
