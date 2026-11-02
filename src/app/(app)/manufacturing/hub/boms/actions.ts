"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";
import { attempt, isUniqueViolation, MfgError } from "../../_lib/server";

const headerSchema = z.object({
  productId: f.id("Product"),
  version: f.int({ min: 1, label: "Version" }),
  outputQty: z.coerce.number({ error: "Output quantity must be a number" }).positive("Output quantity must be greater than 0"),
  isDefault: f.checkbox(),
  isActive: f.checkbox(),
  notes: f.optionalText(),
});

const lineSchema = z.object({
  componentId: z.string().min(1, "Choose a component on every line"),
  quantity: z.coerce.number().positive("Component quantity must be greater than 0"),
  scrapPct: z.coerce.number().min(0, "Scrap % cannot be negative").max(100, "Scrap % must be at most 100"),
});

const operationSchema = z.object({
  sequence: z.coerce.number().int("Sequence must be a whole number").min(0),
  name: z.string().trim().min(1, "Every operation needs a name"),
  machineId: z
    .string()
    .nullish()
    .transform((v) => v || null),
  setupHours: z.coerce.number().min(0, "Setup hours cannot be negative"),
  runHoursPerUnit: z.coerce.number().min(0, "Run hours cannot be negative"),
});

function readJson<T extends z.ZodType>(formData: FormData, field: string, schema: T): { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get(field) ?? "[]"));
  } catch {
    return { ok: false, error: `Could not read ${field}.` };
  }
  const result = schema.safeParse(raw);
  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? `Invalid ${field}.` };
  return { ok: true, data: result.data };
}

type BomInput = z.infer<typeof headerSchema> & {
  lines: Array<z.infer<typeof lineSchema>>;
  operations: Array<z.infer<typeof operationSchema>>;
};

function readBom(formData: FormData): { ok: true; data: BomInput } | { ok: false; state: ActionState } {
  const header = parseForm(headerSchema, formData);
  if (!header.ok) return header;
  const lines = readJson(formData, "lines", z.array(lineSchema).min(1, "Add at least one component"));
  if (!lines.ok) return { ok: false, state: { error: lines.error } };
  const operations = readJson(formData, "operations", z.array(operationSchema));
  if (!operations.ok) return { ok: false, state: { error: operations.error } };
  if (lines.data.some((l) => l.componentId === header.data.productId)) {
    return { ok: false, state: { error: "A product cannot be a component of its own BOM." } };
  }
  return { ok: true, data: { ...header.data, lines: lines.data, operations: operations.data } };
}

/** Only one default BOM per product: clear the flag on the others. */
async function claimDefault(tx: Tx, productId: string, bomId: string) {
  await tx.bom.updateMany({ where: { productId, id: { not: bomId }, isDefault: true }, data: { isDefault: false } });
}

function revalidateBoms(id?: string) {
  revalidatePath("/manufacturing/hub/boms");
  if (id) revalidatePath(`/manufacturing/hub/boms/${id}`);
  revalidatePath("/manufacturing/needs");
}

export async function createBom(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("hubSettings", "edit");
  const parsed = readBom(formData);
  if (!parsed.ok) return parsed.state;
  const { lines, operations, ...header } = parsed.data;

  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const code = await nextDocumentNumber(tx, "BOM");
      const hasDefault = await tx.bom.count({ where: { productId: header.productId, isDefault: true } });
      const bom = await tx.bom.create({
        data: {
          ...header,
          // The first BOM of a product is always its default.
          isDefault: header.isDefault || hasDefault === 0,
          code,
          lines: { create: lines.map((l, position) => ({ ...l, position })) },
          operations: { create: operations },
        },
      });
      if (bom.isDefault) await claimDefault(tx, bom.productId, bom.id);
      await logActivity({ userId: user.id, entityType: "Bom", entityId: bom.id, action: "created", message: `BOM ${code} v${bom.version} created` }, tx);
      return bom.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { version: ["This product already has a BOM with this version"] } };
    throw e;
  }
  revalidateBoms();
  redirect(`/manufacturing/hub/boms/${id}`);
}

/** BOMs referenced by released production orders are frozen; copy to a new version instead. */
async function assertEditable(tx: Tx | typeof db, id: string) {
  const used = await tx.productionOrder.count({ where: { bomId: id, status: { notIn: ["DRAFT", "CANCELLED"] } } });
  if (used > 0) throw new MfgError("This BOM is used by scheduled or running production orders. Copy it to a new version to make changes.");
}

export async function updateBom(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("hubSettings", "edit");
  const parsed = readBom(formData);
  if (!parsed.ok) return parsed.state;
  const { lines, operations, ...header } = parsed.data;

  let result: ActionState;
  try {
    result = await attempt(() =>
      db.$transaction(async (tx) => {
        await assertEditable(tx, id);
        const bom = await tx.bom.update({ where: { id }, data: header });
        await tx.bomLine.deleteMany({ where: { bomId: id } });
        await tx.bomLine.createMany({ data: lines.map((l, position) => ({ ...l, position, bomId: id })) });
        await tx.bomOperation.deleteMany({ where: { bomId: id } });
        if (operations.length > 0) await tx.bomOperation.createMany({ data: operations.map((o) => ({ ...o, bomId: id })) });
        if (bom.isDefault) await claimDefault(tx, bom.productId, bom.id);
        await logActivity({ userId: user.id, entityType: "Bom", entityId: id, action: "updated", message: `BOM ${bom.code} v${bom.version} updated` }, tx);
      }),
    );
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { version: ["This product already has a BOM with this version"] } };
    throw e;
  }
  if (result?.error) return result;
  revalidateBoms(id);
  redirect(`/manufacturing/hub/boms/${id}`);
}

/** Copies a BOM (lines and operations) to the product's next version, as a non-default draft. */
export async function copyBomToNewVersion(id: string): Promise<ActionState> {
  const user = await requireUser("hubSettings", "edit");
  const copyId = await db.$transaction(async (tx) => {
    const source = await tx.bom.findUniqueOrThrow({ where: { id }, include: { lines: true, operations: true } });
    const latest = await tx.bom.aggregate({ where: { productId: source.productId }, _max: { version: true } });
    const version = (latest._max.version ?? 0) + 1;
    const code = await nextDocumentNumber(tx, "BOM");
    const copy = await tx.bom.create({
      data: {
        code,
        productId: source.productId,
        version,
        isDefault: false,
        outputQty: source.outputQty,
        notes: source.notes,
        lines: {
          create: source.lines.map((l) => ({ componentId: l.componentId, quantity: l.quantity, scrapPct: l.scrapPct, position: l.position })),
        },
        operations: {
          create: source.operations.map((o) => ({
            sequence: o.sequence,
            name: o.name,
            machineId: o.machineId,
            setupHours: o.setupHours,
            runHoursPerUnit: o.runHoursPerUnit,
          })),
        },
      },
    });
    await logActivity(
      { userId: user.id, entityType: "Bom", entityId: copy.id, action: "created", message: `BOM ${code} v${version} copied from ${source.code} v${source.version}` },
      tx,
    );
    return copy.id;
  });
  revalidateBoms();
  redirect(`/manufacturing/hub/boms/${copyId}/edit`);
}

export async function makeBomDefault(id: string): Promise<ActionState> {
  const user = await requireUser("hubSettings", "edit");
  await db.$transaction(async (tx) => {
    const bom = await tx.bom.update({ where: { id }, data: { isDefault: true, isActive: true } });
    await claimDefault(tx, bom.productId, id);
    await logActivity({ userId: user.id, entityType: "Bom", entityId: id, action: "default", message: `BOM ${bom.code} v${bom.version} set as default` }, tx);
  });
  revalidateBoms(id);
  return undefined;
}

export async function deleteBom(id: string): Promise<ActionState> {
  await requireUser("hubSettings", "edit");
  const result = await attempt(async () => {
    const orders = await db.productionOrder.count({ where: { bomId: id } });
    if (orders > 0) throw new MfgError("Production orders use this BOM. Mark it inactive instead.");
    await db.bom.deleteMany({ where: { id } });
  });
  if (result?.error) return result;
  revalidateBoms();
  redirect("/manufacturing/hub/boms");
}
