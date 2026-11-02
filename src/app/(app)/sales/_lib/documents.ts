import { num } from "@/lib/format";
import type { ComputedLine, LineInput } from "@/lib/totals";

type Numeric = number | string | { toString(): string };

/** The columns every stored document line (quotation, order, invoice) shares. */
export type StoredLine = {
  productId: string;
  description: string | null;
  quantity: Numeric;
  unitPrice: Numeric;
  discountPct: Numeric;
  taxRate: Numeric;
  taxAmount: Numeric;
  lineTotal: Numeric;
  position: number;
};

/** A business-rule failure raised inside a transaction and returned to the form as `{ error }`. */
export class DocumentError extends Error {}

/** Maps a computed line to the columns written by `create` / `createMany`. */
export function lineData(line: ComputedLine) {
  return {
    productId: line.productId,
    description: line.description ?? null,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPct: line.discountPct,
    taxRate: line.taxRate,
    taxAmount: line.taxAmount,
    lineTotal: line.lineTotal,
    position: line.position,
  };
}

/** Copies stored lines to another document type, e.g. quotation → sales order → invoice. */
export function copyLines(lines: StoredLine[]) {
  return lines.map((l) => ({
    productId: l.productId,
    description: l.description,
    quantity: num(l.quantity),
    unitPrice: num(l.unitPrice),
    discountPct: num(l.discountPct),
    taxRate: num(l.taxRate),
    taxAmount: num(l.taxAmount),
    lineTotal: num(l.lineTotal),
    position: l.position,
  }));
}

/** Stored lines as plain numbers for <LineItemsEditor initialLines />. */
export function toLineInputs(lines: StoredLine[]): LineInput[] {
  return lines.map((l) => ({
    productId: l.productId,
    description: l.description,
    quantity: num(l.quantity),
    unitPrice: num(l.unitPrice),
    discountPct: num(l.discountPct),
    taxRate: num(l.taxRate),
  }));
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Issued invoices with a balance whose due date has passed. */
export function isOverdue(invoice: { status: string; dueDate: Date | null }, today: Date): boolean {
  return (
    (invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID") && !!invoice.dueDate && invoice.dueDate < today
  );
}

/** Open quotations past their validity date. */
export function isExpired(quotation: { status: string; validUntil: Date | null }, today: Date): boolean {
  return (
    (quotation.status === "DRAFT" || quotation.status === "SENT") && !!quotation.validUntil && quotation.validUntil < today
  );
}

/** Narrows a search param to a Prisma enum value, or undefined if it isn't one. */
export function enumParam<T extends Record<string, string>>(values: T, value: string): T[keyof T] | undefined {
  return Object.hasOwn(values, value) ? (values[value] as T[keyof T]) : undefined;
}

/** Customer / warehouse rows as <select> options, e.g. "CUS-0001 — Acme Corp". */
export function toOptions(rows: Array<{ id: string; code: string; name: string }>) {
  return rows.map((r) => ({ value: r.id, label: `${r.code} — ${r.name}` }));
}
