import type { TeamType } from "@/generated/prisma/enums";

export const TEAM_TYPE_LABELS: Record<TeamType, string> = {
  SALES: "Sales",
  PROCUREMENT: "Procurement",
  WAREHOUSE: "Warehouse",
  PRODUCTION: "Production",
  LOGISTICS: "Logistics",
  ACCOUNTS: "Accounts",
  OTHER: "Other",
};
