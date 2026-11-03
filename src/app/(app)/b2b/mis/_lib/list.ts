/** List helpers for the Domestic MIS table: Job No. order and search. Pure. */
import { statusLabel } from "./fields";

/** Plain Job Nos. by number (highest first), then old-style ones ("26-01-0671"), then blanks. */
export function jobRank(jobNo: unknown): [number, number] {
  const s = String(jobNo ?? "").trim();
  if (/^\d{1,15}$/.test(s)) return [0, -Number(s)];
  if (s) return [1, -(parseInt(s.replace(/[^0-9]/g, ""), 10) || 0)];
  return [2, 0];
}

export function sortByJobNo<T extends { jobNo?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const x = jobRank(a.jobNo);
    const y = jobRank(b.jobNo);
    return x[0] - y[0] || x[1] - y[1];
  });
}

export type SearchableRow = {
  jobNo?: string | null;
  customer?: string | null;
  productName?: string | null;
  supplier?: string | null;
  batchNo?: string | null;
  transporterDetails?: string | null;
  status?: string | null;
  logisticsPoc?: string | null;
};

/** Search over job, customer, product, supplier, batch, transporter, status and logistics POC. */
export function matchesSearch(r: SearchableRow, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [r.jobNo, r.customer, r.productName, r.supplier, r.batchNo, r.transporterDetails, statusLabel(r.status), r.logisticsPoc].some((v) =>
    String(v ?? "").toLowerCase().includes(t),
  );
}

export const PAGE_STEP = 200;
