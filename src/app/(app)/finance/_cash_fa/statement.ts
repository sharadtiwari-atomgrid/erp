/**
 * Bank statement import (pure, client-safe): find the header row in a CSV /
 * XLSX sheet, guess which column is which, and turn rows into statement lines
 * with a signed amount (positive = money in, negative = money out).
 */

import { money } from "@/lib/finance/chart";
import { parseDay } from "@/lib/ops/dates";

export type Cell = string | number | boolean | Date | null | undefined;

export type ColumnMapping = {
  date: number;
  description: number;
  reference: number;
  /** Withdrawal / debit column (money out). */
  withdrawal: number;
  /** Deposit / credit column (money in). */
  deposit: number;
  /** Single signed amount column (used when there are no separate withdrawal / deposit columns). */
  amount: number;
  /** Optional Dr / Cr indicator for a single amount column. */
  drCr: number;
  balance: number;
};

export const MAPPING_FIELDS: Array<{ key: keyof ColumnMapping; label: string }> = [
  { key: "date", label: "Posting Date" },
  { key: "description", label: "Description / narration" },
  { key: "reference", label: "Reference / cheque no." },
  { key: "withdrawal", label: "Withdrawal (debit)" },
  { key: "deposit", label: "Deposit (credit)" },
  { key: "amount", label: "Signed amount" },
  { key: "drCr", label: "Dr / Cr indicator" },
  { key: "balance", label: "Balance" },
];

export const NO_COLUMN = -1;

export const emptyMapping = (): ColumnMapping => ({
  date: NO_COLUMN,
  description: NO_COLUMN,
  reference: NO_COLUMN,
  withdrawal: NO_COLUMN,
  deposit: NO_COLUMN,
  amount: NO_COLUMN,
  drCr: NO_COLUMN,
  balance: NO_COLUMN,
});

const norm = (v: Cell) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Each field's patterns are tried in priority order; a column is used once.
const PATTERNS: Array<[keyof ColumnMapping, RegExp[]]> = [
  ["date", [/^(txn|transaction|tran|trans|posting|post|book) ?date$/, /^date$/, /^(?!value).*\bdate\b/, /^value date$/]],
  ["withdrawal", [/withdraw|paid out|money out/, /^(debit|dr)( amount| amt)?( inr)?$/, /^debits$/]],
  ["deposit", [/deposit|paid in|money in/, /^(credit|cr)( amount| amt)?( inr)?$/, /^credits$/]],
  ["balance", [/balance/, /^bal$/]],
  ["drCr", [/^(dr ?cr|cr ?dr|debit ?credit|txn type|type)$/]],
  ["reference", [/ref|cheque|chq|check no|instrument|utr/]],
  ["description", [/narration|description|particulars|details|remarks/, /^transaction$/]],
  ["amount", [/amount|amt/]],
];

/** Guesses the columns from a header row. */
export function detectColumns(header: Cell[]): ColumnMapping {
  const m = emptyMapping();
  const names = header.map(norm);
  const taken = new Set<number>();
  for (const [field, patterns] of PATTERNS) {
    for (const re of patterns) {
      const i = names.findIndex((n, idx) => n && !taken.has(idx) && re.test(n));
      if (i >= 0) {
        m[field] = i;
        taken.add(i);
        break;
      }
    }
  }
  return m;
}

/** Index of the first row that looks like a header (has a date column and an amount-like column). */
export function findHeaderRow(rows: Cell[][], scan = 30): number {
  for (let i = 0; i < Math.min(rows.length, scan); i++) {
    const m = detectColumns(rows[i]);
    if (m.date !== NO_COLUMN && (m.amount !== NO_COLUMN || m.withdrawal !== NO_COLUMN || m.deposit !== NO_COLUMN)) return i;
  }
  return 0;
}

/** Amount text as banks write it: "1,234.50", "(1,234.50)", "1,234.50 Dr", "-1234", "₹ 500". Blank → null. */
export function parseAmount(value: Cell): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = String(value).trim();
  if (!s || /^(-+|—|nil|n\/?a)$/i.test(s)) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\bdr\.?$/i.test(s)) sign = -sign;
  s = s.replace(/\b(dr|cr)\.?$/i, "").replace(/[₹,\s]|inr|rs\.?/gi, "");
  if (!/^[+-]?\d*\.?\d+$/.test(s)) return null;
  return sign * Number(s);
}

export type ParsedLine = { date: string; description: string; reference: string | null; amount: number; balance: number | null; row: number };

export type ParseResult = { lines: ParsedLine[]; skipped: Array<{ row: number; reason: string }> };

const text = (v: Cell) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").replace(/\s+/g, " ").trim());

/** Turns data rows (after the header) into statement lines using a mapping. Row numbers are 1-based sheet rows. */
export function parseStatement(rows: Cell[][], headerIndex: number, m: ColumnMapping): ParseResult {
  const lines: ParsedLine[] = [];
  const skipped: ParseResult["skipped"] = [];
  const at = (r: Cell[], i: number) => (i === NO_COLUMN ? undefined : r[i]);
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    const row = i + 1;
    if (!r || r.every((c) => text(c) === "")) continue;
    const date = parseDay(at(r, m.date));
    if (!date) {
      skipped.push({ row, reason: "No valid date" });
      continue;
    }
    let amount: number | null = null;
    if (m.withdrawal !== NO_COLUMN || m.deposit !== NO_COLUMN) {
      const out = parseAmount(at(r, m.withdrawal));
      const inn = parseAmount(at(r, m.deposit));
      if (out !== null || inn !== null) amount = (inn ?? 0) - Math.abs(out ?? 0);
    } else if (m.amount !== NO_COLUMN) {
      amount = parseAmount(at(r, m.amount));
      const flag = norm(at(r, m.drCr));
      if (amount !== null && flag) {
        if (/^(dr|d|debit|withdrawal)$/.test(flag)) amount = -Math.abs(amount);
        else if (/^(cr|c|credit|deposit)$/.test(flag)) amount = Math.abs(amount);
      }
    }
    if (amount === null || money(amount) === 0) {
      skipped.push({ row, reason: "No amount" });
      continue;
    }
    const description = text(at(r, m.description)) || text(at(r, m.reference)) || "(no description)";
    lines.push({
      date,
      description: description.slice(0, 500),
      reference: text(at(r, m.reference)) || null,
      amount: money(amount),
      balance: m.balance === NO_COLUMN ? null : parseAmount(at(r, m.balance)),
      row,
    });
  }
  return { lines, skipped };
}

/** Problems with a mapping that stop an import, or null. */
export function mappingProblem(m: ColumnMapping): string | null {
  if (m.date === NO_COLUMN) return "Choose the date column.";
  if (m.withdrawal === NO_COLUMN && m.deposit === NO_COLUMN && m.amount === NO_COLUMN) return "Choose the withdrawal and deposit columns, or a signed amount column.";
  return null;
}

/** Key used to skip duplicates: same date + amount + reference. */
export function duplicateKey(l: { date: string; amount: number; reference: string | null }): string {
  return `${l.date}|${money(l.amount).toFixed(2)}|${(l.reference ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

/** Drops lines whose key is already in `existing` or repeated within the batch. */
export function dropDuplicates<T extends { date: string; amount: number; reference: string | null }>(lines: T[], existing: Iterable<string>): { fresh: T[]; duplicates: number } {
  const seen = new Set(existing);
  const fresh: T[] = [];
  let duplicates = 0;
  for (const l of lines) {
    const k = duplicateKey(l);
    if (seen.has(k)) duplicates++;
    else {
      seen.add(k);
      fresh.push(l);
    }
  }
  return { fresh, duplicates };
}
