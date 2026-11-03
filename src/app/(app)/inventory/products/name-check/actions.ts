"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";
import { classOf, funnelOf, parseProductMaster, type SheetProduct } from "./product-names";

const MAX_BYTES = 25 * 1024 * 1024;

/** Reads the uploaded Product Master sheet (first tab). */
export async function readProductSheet(formData: FormData): Promise<{ ok: true; file: string; products: SheetProduct[] } | { ok: false; error: string }> {
  await requireUser("products");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  if (file.size > MAX_BYTES) return { ok: false, error: "The file is larger than 25 MB." };
  try {
    const book = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const first = book.Sheets[book.SheetNames[0]];
    if (!first) return { ok: false, error: "The file has no sheets." };
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(first, { header: 1, raw: false, defval: "" });
    const products = parseProductMaster(aoa);
    if (!products.length) return { ok: false, error: "No products found under the “Product Name” column." };
    return { ok: true, file: file.name, products };
  } catch (e) {
    return { ok: false, error: `Couldn't read that file: ${e instanceof Error ? e.message : String(e)}` };
  }
}

const clip = (v: unknown, n = 300) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export type ApplyResult = {
  added: number;
  updated: number;
  renamed: number;
  mis: number;
  po: number;
  inward: number;
  outward: number;
  removed: number;
  kept: number;
};

async function uniqueSku(tx: Tx, wanted: string): Promise<string> {
  const base = wanted.toUpperCase().replace(/\s+/g, "-").slice(0, 40) || "PM";
  if (wanted && !(await tx.product.findUnique({ where: { sku: base }, select: { id: true } }))) return base;
  for (let i = 1; ; i++) {
    const sku = `${base}-${i}`;
    if (!(await tx.product.findUnique({ where: { sku }, select: { id: true } }))) return sku;
  }
}

/** Something other than the master itself still points at this product row. */
async function referenced(tx: Tx, id: string): Promise<boolean> {
  const p = await tx.product.findUnique({
    where: { id },
    select: {
      _count: {
        select: {
          stockLevels: true, stockMovements: true, binStocks: true, quotationLines: true, salesOrderLines: true, invoiceLines: true,
          purchaseOrderLines: true, inboundLines: true, outboundLines: true, handlingUnitItems: true, boms: true, bomComponentOf: true,
          productionOrders: true, returnLines: true,
        },
      },
    },
  });
  return !p || Object.values(p._count).some((n) => n > 0);
}

/**
 * 1. Every sheet product goes into the product master (added, or its class / CAS / HSN / funnel / other names updated).
 * 2. Each rename is carried onto Domestic MIS, Fresh PO and the batch registers' catalogue name; the old
 *    name's product row is then deleted when it isn't in the sheet and nothing else references it.
 */
export async function applyProductNames(input: {
  products: SheetProduct[];
  renames: Array<{ from: string; to: string }>;
}): Promise<{ ok: true; result: ApplyResult } | { ok: false; error: string }> {
  const user = await requireUser("products", "edit");
  const products = (Array.isArray(input.products) ? input.products : [])
    .slice(0, 5000)
    .map((p) => ({
      code: clip(p.code, 40),
      name: clip(p.name, 200),
      productClass: classOf(clip(p.type, 60)),
      casNo: clip(p.casNo, 60) || null,
      hsnCode: clip(p.hsn, 30) || null,
      funnel: funnelOf(clip(p.funnel, 20)),
      aliases: (Array.isArray(p.aliases) ? p.aliases : []).map((a) => clip(a, 200)).filter(Boolean).slice(0, 20),
    }))
    .filter((p) => p.name);
  const sheet = new Set(products.map((p) => p.name));
  const renames = (Array.isArray(input.renames) ? input.renames : [])
    .map((r) => ({ from: String(r.from ?? ""), to: clip(r.to, 200) }))
    .filter((r) => r.from.trim() && r.to && r.from !== r.to && sheet.has(r.to));
  const out: ApplyResult = { added: 0, updated: 0, renamed: renames.length, mis: 0, po: 0, inward: 0, outward: 0, removed: 0, kept: 0 };

  try {
    await db.$transaction(
      async (tx) => {
        for (const p of products) {
          const cur = await tx.product.findFirst({ where: { name: p.name }, orderBy: { createdAt: "asc" } });
          // Only filled-in sheet values are written; nothing is blanked.
          const data = {
            ...(p.productClass && { productClass: p.productClass }),
            ...(p.casNo && { casNo: p.casNo }),
            ...(p.hsnCode && { hsnCode: p.hsnCode }),
            ...(p.funnel && { funnel: p.funnel }),
            ...(p.aliases.length > 0 && { aliases: p.aliases }),
          };
          if (cur) {
            const after = await tx.product.update({ where: { id: cur.id }, data });
            const changes = diff(cur, after);
            if (Object.keys(changes).length) {
              out.updated++;
              await recordChange({ userId: user.id, entityType: "Product", entityId: cur.id, action: "updated", message: `Product ${cur.name} updated from the Product Master sheet`, changes }, tx);
            }
          } else {
            const created = await tx.product.create({ data: { sku: await uniqueSku(tx, p.code), name: p.name, unit: "kg", ...data } });
            out.added++;
            await recordChange({ userId: user.id, entityType: "Product", entityId: created.id, action: "created", message: `Product ${created.name} added from the Product Master sheet` }, tx);
          }
        }
        for (const { from, to } of renames) {
          out.mis += (await tx.misJob.updateMany({ where: { productName: from }, data: { productName: to } })).count;
          out.po += (await tx.freshPo.updateMany({ where: { product: from }, data: { product: to } })).count;
          // The catalogue name (else the product name) is the name stock is kept under; the supplier's own name stays.
          out.inward += (await tx.batchInward.updateMany({ where: { catalogueName: from }, data: { catalogueName: to } })).count;
          out.inward += (await tx.batchInward.updateMany({ where: { OR: [{ catalogueName: null }, { catalogueName: "" }], productName: from }, data: { catalogueName: to } })).count;
          out.outward += (await tx.batchOutward.updateMany({ where: { catalogueName: from }, data: { catalogueName: to } })).count;
          out.outward += (await tx.batchOutward.updateMany({ where: { OR: [{ catalogueName: null }, { catalogueName: "" }], productName: from }, data: { catalogueName: to } })).count;
          if (!sheet.has(from)) {
            for (const old of await tx.product.findMany({ where: { name: from }, select: { id: true, name: true } })) {
              if (await referenced(tx, old.id)) {
                out.kept++;
                continue;
              }
              await tx.product.delete({ where: { id: old.id } });
              await recordChange({ userId: user.id, entityType: "Product", entityId: old.id, action: "deleted", message: `Product ${old.name} removed: renamed to ${to} by the product name check` }, tx);
              out.removed++;
            }
          }
        }
        const target = await tx.product.findFirst({ where: { name: renames[0]?.to ?? "" }, select: { id: true } });
        if (renames.length && target) {
          await recordChange(
            {
              userId: user.id,
              entityType: "Product",
              entityId: target.id,
              action: "names checked",
              message: `Product name check: ${renames.length} name(s) changed on ${out.mis} MIS job(s), ${out.po} Fresh PO(s), ${out.inward} inward and ${out.outward} outward line(s)`,
              changes: Object.fromEntries(renames.slice(0, 200).map((r, i) => [`rename ${i + 1}`, [r.from, r.to]])),
            },
            tx,
          );
        }
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/inventory/products");
  revalidatePath("/inventory/products/name-check");
  revalidatePath("/b2b", "layout");
  return { ok: true, result: out };
}
