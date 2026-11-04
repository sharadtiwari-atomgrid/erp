"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { dayFromIso, parseDay } from "@/lib/ops/dates";

const currencySchema = z.object({
  code: f
    .text("Code")
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/, "Use the 3-letter ISO code")),
  name: f.text("Name"),
  symbol: f.optionalText(),
});
const editSchema = z.object({ name: f.text("Name"), symbol: f.optionalText(), isActive: f.checkbox() });

function done() {
  revalidatePath("/finance/currencies");
}

export async function addCurrency(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const parsed = parseForm(currencySchema, formData);
  if (!parsed.ok) return parsed.state;
  if (await db.currency.findUnique({ where: { code: parsed.data.code } })) return { error: `${parsed.data.code} already exists.` };
  await db.currency.create({ data: parsed.data });
  await recordChange({ userId: user.id, entityType: "Currency", entityId: parsed.data.code, action: "created", message: `Currency ${parsed.data.code} added` });
  done();
  return { success: `${parsed.data.code} added.` };
}

export async function updateCurrency(code: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const before = await db.currency.findUnique({ where: { code } });
  if (!before) return { error: "This currency no longer exists." };
  if (before.isBase) return { error: "The base currency (INR) can't be changed." };
  const parsed = parseForm(editSchema, formData);
  if (!parsed.ok) return parsed.state;
  await db.currency.update({ where: { code }, data: parsed.data });
  await recordChange({ userId: user.id, entityType: "Currency", entityId: code, action: "updated", message: `Currency ${code} updated`, changes: { name: [before.name, parsed.data.name], symbol: [before.symbol, parsed.data.symbol], isActive: [before.isActive, parsed.data.isActive] } });
  done();
  return { success: "Saved." };
}

/** Adds or overwrites the rate (rupees per unit) for a currency on a date. */
export async function setRate(code: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const currency = await db.currency.findUnique({ where: { code } });
  if (!currency) return { error: "This currency no longer exists." };
  if (currency.isBase) return { error: "The base currency is always 1." };
  const date = parseDay(formData.get("date"));
  const rate = Number(formData.get("rate"));
  if (!date) return { error: "Enter the rate date." };
  if (!Number.isFinite(rate) || rate <= 0) return { error: "Enter a rate greater than 0." };
  const day = dayFromIso(date);
  const before = await db.exchangeRate.findUnique({ where: { currencyCode_date: { currencyCode: code, date: day } } });
  await db.exchangeRate.upsert({
    where: { currencyCode_date: { currencyCode: code, date: day } },
    create: { currencyCode: code, date: day, rate },
    update: { rate },
  });
  await recordChange({ userId: user.id, entityType: "Currency", entityId: code, action: "updated", message: `${code} rate on ${date} set to ${rate}`, changes: { [`rate ${date}`]: [before ? Number(before.rate) : "", rate] } });
  done();
  return { success: before ? "Rate updated." : "Rate added." };
}
