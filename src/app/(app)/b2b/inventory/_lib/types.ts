import type { SheetIssue } from "@/lib/batch-inventory";

export type Masters = {
  products: { name: string; hsn: string; type: string }[];
  suppliers: string[];
  customers: string[];
  pocs: string[];
};

/** A Domestic MIS job as the inward / outward forms use it. */
export type JobRef = { jobNo: string; supplier: string; customer: string; productName: string; supplyPoc: string; batchNo: string; quantityKgs: string; etd: string };

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
export type Preview<E> = { ok: true; fileName: string; entries: E[]; issues: SheetIssue[] } | { ok: false; error: string };
export type ImportResult = { ok: true; added: number; skipped: number; removed: number } | { ok: false; error: string };

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
