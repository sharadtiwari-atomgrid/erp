import type { ContactRole } from "@/generated/prisma/enums";

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  CUSTOMER: "Customer",
  SUPPLIER: "Supplier / vendor",
  TRANSPORTER: "Transporter",
  OTHER: "Other",
};

export const CONTACT_ROLE_TONES = { CUSTOMER: "blue", SUPPLIER: "violet", TRANSPORTER: "amber", OTHER: "gray" } as const;
