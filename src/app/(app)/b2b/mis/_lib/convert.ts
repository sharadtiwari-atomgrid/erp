/**
 * MisJob (database) ⇄ MIS row values (flat strings the form and checks use).
 * Day columns hold UTC midnight; date-times are shown and entered in IST.
 * Pure: imports only types.
 */
import type { MisStatus } from "@/generated/prisma/enums";
import { parseNumber } from "@/lib/ops/dates";
import { parseMisStatus } from "@/lib/ops/lists";
import { VALUE_FIELDS, type MisValues } from "./fields";

const IST_MS = 330 * 60_000;

/** The MisJob columns behind the row values. */
export const DECIMAL_KEYS = new Set([
  "quantityKgs",
  "grossWtKg",
  "totalLogisticsCost",
  "logisticsCostAgToPay",
  "distanceApprox",
  "taxableValue",
  "transportPaidSoFar",
]);
const DATE_KEYS = new Set(VALUE_FIELDS.filter((f) => f.type === "date").map((f) => f.key));
const DATETIME_KEYS = new Set(VALUE_FIELDS.filter((f) => f.type === "datetime").map((f) => f.key));

type Decimalish = { toString(): string } | number | string | null | undefined;
type JobLike = Record<string, unknown>;

function toText(key: string, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (DATE_KEYS.has(key)) return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  if (DATETIME_KEYS.has(key)) {
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? "" : new Date(d.getTime() + IST_MS).toISOString().slice(0, 16);
  }
  if (DECIMAL_KEYS.has(key)) {
    const n = Number((v as Decimalish)!.toString());
    return Number.isFinite(n) ? String(n) : "";
  }
  return String(v);
}

/** A MisJob (or any object with its columns) → row values. */
export function valuesFromJob(job: JobLike): MisValues {
  const out: MisValues = {};
  for (const f of VALUE_FIELDS) out[f.key] = toText(f.key, job[f.key]);
  return out;
}

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/** One row value → the value for its MisJob column. */
export function columnValue(key: string, v: string | null | undefined): unknown {
  if (blank(v)) return key === "jobNo" ? "" : null;
  const s = String(v).trim();
  if (key === "status") return parseMisStatus(s);
  if (DATE_KEYS.has(key)) return /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(`${s.slice(0, 10)}T00:00:00.000Z`) : null;
  if (DATETIME_KEYS.has(key)) {
    const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
    return m ? new Date(`${m[1]}T${m[2] ?? "00:00"}:00+05:30`) : null;
  }
  if (DECIMAL_KEYS.has(key)) return parseNumber(s);
  return s;
}

/** Row values (some or all) → MisJob update data. Unknown keys are ignored. */
export function dataFromValues(values: Partial<MisValues>): Record<string, unknown> {
  const keys = new Set(VALUE_FIELDS.map((f) => f.key));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) if (keys.has(k)) out[k] = columnValue(k, v);
  return out;
}

/** Values as they will read back after saving (numbers and dates normalised). */
export function normaliseValues(values: Partial<MisValues>): MisValues {
  const out: MisValues = {};
  for (const [k, v] of Object.entries(dataFromValues(values))) out[k] = toText(k, v);
  return out;
}

export type { MisStatus };
