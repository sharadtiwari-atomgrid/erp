import { z } from "zod";

/** Extra zod field builders for logistics forms (raw FormData strings). */
export const optionalNumber = (label = "Value", min = 0) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || Number.isFinite(v), `${label} must be a number`)
    .refine((v) => v === null || v >= min, `${label} must be at least ${min}`);

export const optionalId = () =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v : null));

export const optionalTime = (label = "Time") =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), `${label} must be HH:mm`);

/** Indian vehicle registration numbers are stored without spaces, upper-case: "MH 01 AB 1234" → "MH01AB1234". */
export const registrationNo = () =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, "").toUpperCase())
    .pipe(z.string().min(4, "Registration number is required").max(15, "Registration number is too long"));

/** True when a Prisma error is a unique-constraint violation. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002";
}
