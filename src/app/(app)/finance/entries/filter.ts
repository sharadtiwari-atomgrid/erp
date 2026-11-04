import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { glEntryWhere } from "@/lib/finance/queries";

export type EntryFilter = {
  from: string;
  to: string;
  account: string;
  docType: string;
  docNo: string;
  contact: string;
  branch: string;
  transactionNo: string;
  dims: Record<string, string>;
};

const iso = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** Reads the G/L entries filters from search params (dimension filters arrive as dim_CODE=VALUE). */
export function readEntryFilter(get: (key: string) => string, keys: string[]): EntryFilter {
  const dims: Record<string, string> = {};
  for (const k of keys) if (k.startsWith("dim_") && get(k)) dims[k.slice(4)] = get(k);
  return {
    from: iso(get("from")),
    to: iso(get("to")),
    account: get("account"),
    docType: get("docType"),
    docNo: get("docNo").trim(),
    contact: get("contact").trim(),
    branch: get("branch"),
    transactionNo: /^\d+$/.test(get("transactionNo")) ? get("transactionNo") : "",
    dims,
  };
}

/** The account and every account beneath it (for headings). */
async function accountAndDescendants(id: string): Promise<string[]> {
  const ids = [id];
  let frontier = [id];
  while (frontier.length) {
    const kids = await db.glAccount.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    frontier = kids.map((k) => k.id).filter((k) => !ids.includes(k));
    ids.push(...frontier);
  }
  return ids;
}

export async function entryWhere(f: EntryFilter): Promise<Prisma.GlEntryWhereInput> {
  return {
    ...glEntryWhere({ from: f.from || undefined, to: f.to || undefined, branchId: f.branch || null, dimensions: f.dims }),
    ...(f.account ? { accountId: { in: await accountAndDescendants(f.account) } } : {}),
    ...(f.docType ? { documentType: f.docType } : {}),
    ...(f.docNo ? { documentNo: { contains: f.docNo, mode: "insensitive" } } : {}),
    ...(f.contact ? { contact: { name: { contains: f.contact, mode: "insensitive" } } } : {}),
    ...(f.transactionNo ? { transactionNo: Number(f.transactionNo) } : {}),
  };
}

export const entryInclude = {
  account: { select: { id: true, code: true, name: true } },
  contact: { select: { id: true, name: true } },
} satisfies Prisma.GlEntryInclude;
