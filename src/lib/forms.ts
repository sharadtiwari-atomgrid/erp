import { z } from "zod";
import type { LineInput } from "@/lib/totals";

/** State returned by server actions used with useActionState. */
export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  success?: string;
} | undefined;

/** Reusable zod field builders that understand raw FormData strings. */
export const f = {
  text: (label = "This field") => z.string().trim().min(1, `${label} is required`),
  optionalText: () =>
    z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null)),
  email: () =>
    z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(z.email("Enter a valid email").nullable()),
  number: (opts: { min?: number; label?: string } = {}) =>
    z.coerce
      .number({ error: `${opts.label ?? "Value"} must be a number` })
      .min(opts.min ?? 0, `${opts.label ?? "Value"} must be at least ${opts.min ?? 0}`),
  int: (opts: { min?: number; label?: string } = {}) =>
    z.coerce
      .number({ error: `${opts.label ?? "Value"} must be a number` })
      .int(`${opts.label ?? "Value"} must be a whole number`)
      .min(opts.min ?? 0),
  checkbox: () => z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  date: () => z.coerce.date({ error: "Enter a valid date" }),
  optionalDate: () =>
    z
      .string()
      .optional()
      .transform((v) => (v ? new Date(v) : null))
      .refine((d) => d === null || !Number.isNaN(d.getTime()), "Enter a valid date"),
  id: (label = "Selection") => z.string().min(1, `${label} is required`),
};

/** Parses FormData against a zod object schema. */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { ok: true; data: z.infer<T> } | { ok: false; state: ActionState } {
  const raw: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("$ACTION")) raw[key] = value;
  }
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const flat = z.flattenError(result.error);
  return {
    ok: false,
    state: {
      error: flat.formErrors[0] ?? "Please fix the highlighted fields.",
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    },
  };
}

const lineSchema = z.object({
  productId: z.string().min(1, "Choose a product on every line"),
  description: z.string().trim().nullish(),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unitPrice: z.coerce.number().min(0, "Price cannot be negative"),
  discountPct: z.coerce.number().min(0).max(100, "Discount must be between 0 and 100"),
  taxRate: z.coerce.number().min(0).max(100),
});

/** Reads the JSON `lines` field written by <LineItemsEditor />. */
export function parseLines(
  formData: FormData,
  field = "lines",
): { ok: true; lines: LineInput[] } | { ok: false; state: ActionState } {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get(field) ?? "[]"));
  } catch {
    return { ok: false, state: { error: "Could not read line items." } };
  }
  const result = z.array(lineSchema).min(1, "Add at least one line item").safeParse(raw);
  if (!result.success) {
    return { ok: false, state: { error: result.error.issues[0]?.message ?? "Invalid line items." } };
  }
  return { ok: true, lines: result.data.map((l) => ({ ...l, description: l.description ?? null })) };
}

/** Reads a single string search param (Next passes string | string[] | undefined). */
export function param(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export const PAGE_SIZE = 20;

export function pagination(sp: Record<string, string | string[] | undefined>) {
  const page = Math.max(1, Number.parseInt(param(sp, "page"), 10) || 1);
  return { page, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE };
}
