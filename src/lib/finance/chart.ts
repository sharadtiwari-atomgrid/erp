import type { GlAccountType } from "@/generated/prisma/enums";

/**
 * Standard chart of accounts for an Indian manufacturer / trader, grouped by
 * Schedule III headings. Loaded once by ensureFinanceSetup(); users can add or
 * rename accounts afterwards. Safe to import on the client.
 */

export type ChartAccount = {
  code: string;
  name: string;
  type: GlAccountType;
  category: string;
  parent?: string;
  isGroup?: boolean;
  cashFlowGroup?: "OPERATING" | "INVESTING" | "FINANCING" | "CASH" | "NONE";
  /** Control accounts are posted only by documents, never by manual journals. */
  control?: boolean;
};

const A = "ASSET", L = "LIABILITY", E = "EQUITY", I = "INCOME", X = "EXPENSE";

export const DEFAULT_ACCOUNTS: ChartAccount[] = [
  // Assets
  { code: "1000", name: "Non-current assets", type: A, category: "Non-current assets", isGroup: true },
  { code: "1100", name: "Property, plant & equipment", type: A, category: "Property, plant & equipment", parent: "1000", isGroup: true, cashFlowGroup: "INVESTING" },
  { code: "1110", name: "Land & buildings", type: A, category: "Property, plant & equipment", parent: "1100", cashFlowGroup: "INVESTING" },
  { code: "1120", name: "Plant & machinery", type: A, category: "Property, plant & equipment", parent: "1100", cashFlowGroup: "INVESTING" },
  { code: "1130", name: "Furniture & fixtures", type: A, category: "Property, plant & equipment", parent: "1100", cashFlowGroup: "INVESTING" },
  { code: "1140", name: "Vehicles", type: A, category: "Property, plant & equipment", parent: "1100", cashFlowGroup: "INVESTING" },
  { code: "1150", name: "Office equipment & computers", type: A, category: "Property, plant & equipment", parent: "1100", cashFlowGroup: "INVESTING" },
  { code: "1190", name: "Accumulated depreciation", type: A, category: "Property, plant & equipment", parent: "1100", cashFlowGroup: "NONE", control: true },
  { code: "1200", name: "Capital work-in-progress", type: A, category: "Capital work-in-progress", parent: "1000", cashFlowGroup: "INVESTING" },
  { code: "1300", name: "Security deposits", type: A, category: "Long-term loans & advances", parent: "1000", cashFlowGroup: "INVESTING" },
  { code: "1400", name: "Current assets", type: A, category: "Current assets", isGroup: true },
  { code: "1410", name: "Inventories", type: A, category: "Inventories", parent: "1400" },
  { code: "1420", name: "Trade receivables", type: A, category: "Trade receivables", parent: "1400", control: true },
  { code: "1430", name: "Cash in hand", type: A, category: "Cash & cash equivalents", parent: "1400", cashFlowGroup: "CASH" },
  { code: "1440", name: "Bank accounts", type: A, category: "Cash & cash equivalents", parent: "1400", isGroup: true, cashFlowGroup: "CASH" },
  { code: "1441", name: "Main bank account", type: A, category: "Cash & cash equivalents", parent: "1440", cashFlowGroup: "CASH" },
  { code: "1450", name: "Input CGST", type: A, category: "Other current assets", parent: "1400", control: true },
  { code: "1451", name: "Input SGST", type: A, category: "Other current assets", parent: "1400", control: true },
  { code: "1452", name: "Input IGST", type: A, category: "Other current assets", parent: "1400", control: true },
  { code: "1460", name: "TDS receivable", type: A, category: "Other current assets", parent: "1400" },
  { code: "1470", name: "Advances to suppliers", type: A, category: "Short-term loans & advances", parent: "1400" },
  { code: "1480", name: "Prepaid expenses", type: A, category: "Other current assets", parent: "1400" },
  { code: "1490", name: "Other current assets", type: A, category: "Other current assets", parent: "1400" },
  // Liabilities
  { code: "2000", name: "Non-current liabilities", type: L, category: "Non-current liabilities", isGroup: true },
  { code: "2100", name: "Long-term borrowings", type: L, category: "Long-term borrowings", parent: "2000", cashFlowGroup: "FINANCING" },
  { code: "2200", name: "Current liabilities", type: L, category: "Current liabilities", isGroup: true },
  { code: "2210", name: "Trade payables", type: L, category: "Trade payables", parent: "2200", control: true },
  { code: "2220", name: "Output CGST", type: L, category: "Other current liabilities", parent: "2200", control: true },
  { code: "2221", name: "Output SGST", type: L, category: "Other current liabilities", parent: "2200", control: true },
  { code: "2222", name: "Output IGST", type: L, category: "Other current liabilities", parent: "2200", control: true },
  { code: "2230", name: "TDS payable", type: L, category: "Other current liabilities", parent: "2200" },
  { code: "2231", name: "TCS payable", type: L, category: "Other current liabilities", parent: "2200" },
  { code: "2240", name: "Advances from customers", type: L, category: "Other current liabilities", parent: "2200" },
  { code: "2250", name: "Short-term borrowings", type: L, category: "Short-term borrowings", parent: "2200", cashFlowGroup: "FINANCING" },
  { code: "2260", name: "Salaries payable", type: L, category: "Other current liabilities", parent: "2200" },
  { code: "2270", name: "Provisions & other payables", type: L, category: "Short-term provisions", parent: "2200" },
  // Equity
  { code: "3000", name: "Equity", type: E, category: "Equity", isGroup: true, cashFlowGroup: "FINANCING" },
  { code: "3100", name: "Share capital", type: E, category: "Share capital", parent: "3000", cashFlowGroup: "FINANCING" },
  { code: "3200", name: "Retained earnings", type: E, category: "Reserves & surplus", parent: "3000", cashFlowGroup: "NONE", control: true },
  { code: "3300", name: "Opening balance equity", type: E, category: "Reserves & surplus", parent: "3000", cashFlowGroup: "NONE" },
  // Income
  { code: "4000", name: "Revenue from operations", type: I, category: "Revenue from operations", isGroup: true },
  { code: "4100", name: "Sales – goods", type: I, category: "Revenue from operations", parent: "4000" },
  { code: "4110", name: "Sales – services", type: I, category: "Revenue from operations", parent: "4000" },
  { code: "4120", name: "Freight recovered", type: I, category: "Revenue from operations", parent: "4000" },
  { code: "4200", name: "Other income", type: I, category: "Other income", isGroup: true },
  { code: "4210", name: "Interest income", type: I, category: "Other income", parent: "4200" },
  { code: "4220", name: "Profit on sale of assets", type: I, category: "Other income", parent: "4200", cashFlowGroup: "NONE" },
  { code: "4230", name: "Discount received", type: I, category: "Other income", parent: "4200" },
  // Expenses
  { code: "5000", name: "Cost of materials", type: X, category: "Cost of materials consumed", isGroup: true },
  { code: "5100", name: "Purchases – goods", type: X, category: "Purchases of stock-in-trade", parent: "5000" },
  { code: "5110", name: "Purchases – raw materials", type: X, category: "Cost of materials consumed", parent: "5000" },
  { code: "5200", name: "Freight inward", type: X, category: "Cost of materials consumed", parent: "5000" },
  { code: "5300", name: "Changes in inventories", type: X, category: "Changes in inventories", parent: "5000" },
  { code: "6000", name: "Operating expenses", type: X, category: "Other expenses", isGroup: true },
  { code: "6100", name: "Salaries & wages", type: X, category: "Employee benefits expense", parent: "6000" },
  { code: "6200", name: "Freight outward", type: X, category: "Other expenses", parent: "6000" },
  { code: "6210", name: "Rent", type: X, category: "Other expenses", parent: "6000" },
  { code: "6220", name: "Power & fuel", type: X, category: "Other expenses", parent: "6000" },
  { code: "6230", name: "Repairs & maintenance", type: X, category: "Other expenses", parent: "6000" },
  { code: "6240", name: "Travelling & conveyance", type: X, category: "Other expenses", parent: "6000" },
  { code: "6250", name: "Communication", type: X, category: "Other expenses", parent: "6000" },
  { code: "6260", name: "Professional fees", type: X, category: "Other expenses", parent: "6000" },
  { code: "6270", name: "Bank charges", type: X, category: "Finance costs", parent: "6000" },
  { code: "6280", name: "Insurance", type: X, category: "Other expenses", parent: "6000" },
  { code: "6290", name: "Office & administrative expenses", type: X, category: "Other expenses", parent: "6000" },
  { code: "6300", name: "Depreciation", type: X, category: "Depreciation & amortisation", parent: "6000", cashFlowGroup: "NONE" },
  { code: "6400", name: "Interest expense", type: X, category: "Finance costs", parent: "6000", cashFlowGroup: "FINANCING" },
  { code: "6910", name: "Loss on sale of assets", type: X, category: "Other expenses", parent: "6000", cashFlowGroup: "NONE" },
  { code: "6990", name: "Rounding off", type: X, category: "Other expenses", parent: "6000" },
];

/** Posting setup: which account each kind of posting uses (editable in Finance › Setup). */
export const POSTING_KEYS = {
  RECEIVABLES: { code: "1420", label: "Customer receivables" },
  PAYABLES: { code: "2210", label: "Supplier payables" },
  SALES_GOODS: { code: "4100", label: "Sales of goods" },
  SALES_SERVICES: { code: "4110", label: "Sales of services" },
  PURCHASES: { code: "5100", label: "Purchases of goods" },
  OUTPUT_CGST: { code: "2220", label: "Output CGST" },
  OUTPUT_SGST: { code: "2221", label: "Output SGST" },
  OUTPUT_IGST: { code: "2222", label: "Output IGST" },
  INPUT_CGST: { code: "1450", label: "Input CGST" },
  INPUT_SGST: { code: "1451", label: "Input SGST" },
  INPUT_IGST: { code: "1452", label: "Input IGST" },
  TDS_PAYABLE: { code: "2230", label: "TDS payable" },
  TCS_PAYABLE: { code: "2231", label: "TCS payable" },
  TDS_RECEIVABLE: { code: "1460", label: "TDS receivable" },
  CUSTOMER_ADVANCES: { code: "2240", label: "Advances from customers" },
  SUPPLIER_ADVANCES: { code: "1470", label: "Advances to suppliers" },
  CASH: { code: "1430", label: "Cash in hand" },
  BANK: { code: "1441", label: "Default bank account" },
  FIXED_ASSETS: { code: "1120", label: "Fixed assets (default cost account)" },
  ACCUMULATED_DEPRECIATION: { code: "1190", label: "Accumulated depreciation" },
  DEPRECIATION_EXPENSE: { code: "6300", label: "Depreciation expense" },
  ASSET_DISPOSAL_GAIN: { code: "4220", label: "Profit on sale of assets" },
  ASSET_DISPOSAL_LOSS: { code: "6910", label: "Loss on sale of assets" },
  RETAINED_EARNINGS: { code: "3200", label: "Retained earnings (year-end close)" },
  OPENING_BALANCE: { code: "3300", label: "Opening balance equity" },
  ROUNDING: { code: "6990", label: "Rounding off" },
  BANK_CHARGES: { code: "6270", label: "Bank charges" },
} as const;

export type PostingKey = keyof typeof POSTING_KEYS;

/** Fixed asset category → cost account. */
export const ASSET_CATEGORY_ACCOUNTS: Record<string, string> = {
  Buildings: "1110",
  "Plant & machinery": "1120",
  "Furniture & fixtures": "1130",
  Vehicles: "1140",
  "Office equipment": "1150",
  Computers: "1150",
  Other: "1120",
};

export const DEFAULT_DIMENSIONS = [
  { code: "DIVISION", name: "Division", values: [["B2B", "B2B division"], ["B2C", "B2C division"]] },
  {
    code: "DEPARTMENT",
    name: "Department",
    values: [
      ["DEMAND", "Demand"], ["SUPPLY", "Supply"], ["LOGISTICS", "Logistics"], ["RND", "R&D"], ["PILOTS", "Pilots"],
      ["QC", "QC Sampling"], ["LICENSING", "Licensing"], ["FINANCE", "Finance"], ["ADMIN", "Administration"],
    ],
  },
  { code: "PROJECT", name: "Project", values: [] },
] as const;

/** Common TDS / TCS sections (rates in %). Editable in Finance › Tax. */
export const DEFAULT_TDS_SECTIONS = [
  { code: "194C", description: "Payments to contractors (incl. transporters)", kind: "TDS", rateIndividual: 1, rateCompany: 2, thresholdSingle: 30000, thresholdAnnual: 100000 },
  { code: "194J", description: "Professional or technical services", kind: "TDS", rateIndividual: 10, rateCompany: 10, thresholdSingle: null, thresholdAnnual: 30000 },
  { code: "194I", description: "Rent – land, building or furniture", kind: "TDS", rateIndividual: 10, rateCompany: 10, thresholdSingle: null, thresholdAnnual: 240000 },
  { code: "194H", description: "Commission or brokerage", kind: "TDS", rateIndividual: 2, rateCompany: 2, thresholdSingle: null, thresholdAnnual: 15000 },
  { code: "194Q", description: "Purchase of goods", kind: "TDS", rateIndividual: 0.1, rateCompany: 0.1, thresholdSingle: null, thresholdAnnual: 5000000 },
  { code: "206C(1H)", description: "Sale of goods (TCS)", kind: "TCS", rateIndividual: 0.1, rateCompany: 0.1, thresholdSingle: null, thresholdAnnual: 5000000 },
] as const;

/** Debit-normal for assets and expenses, credit-normal for the rest. */
export function isDebitNormal(type: GlAccountType): boolean {
  return type === "ASSET" || type === "EXPENSE";
}

/** Balance in the account's normal direction (positive = normal). */
export function normalBalance(type: GlAccountType, debit: number, credit: number): number {
  return isDebitNormal(type) ? debit - credit : credit - debit;
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Indian financial year (April–March) containing an ISO date. */
export function fiscalYearOf(iso: string): { name: string; start: string; end: string; startYear: number } {
  const [y, m] = iso.split("-").map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return {
    name: `FY ${startYear}-${pad((startYear + 1) % 100)}`,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
    startYear,
  };
}

/** The twelve monthly periods of a financial year starting in April of startYear. */
export function periodsOf(startYear: number): Array<{ name: string; start: string; end: string }> {
  return Array.from({ length: 12 }, (_, i) => {
    const month = ((3 + i) % 12) + 1;
    const year = startYear + (i >= 9 ? 1 : 0);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { name: `${MONTHS[month - 1]} ${year}`, start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(last)}` };
  });
}

/** TDS quarter label, e.g. "Q3 FY 2026-27" (Q1 = Apr–Jun). */
export function tdsQuarterOf(iso: string): string {
  const m = Number(iso.slice(5, 7));
  const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4;
  return `Q${q} ${fiscalYearOf(iso).name}`;
}

export type PostingLine = { debit?: number; credit?: number };

export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Throws unless the lines balance (to the paisa) and each line is one-sided and non-negative. */
export function assertBalanced(lines: PostingLine[]): { debit: number; credit: number } {
  if (lines.length < 2) throw new Error("A posting needs at least two lines.");
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    const d = money(l.debit ?? 0);
    const c = money(l.credit ?? 0);
    if (d < 0 || c < 0) throw new Error("Debit and credit amounts cannot be negative.");
    if (d > 0 && c > 0) throw new Error("A line cannot have both a debit and a credit.");
    debit += d;
    credit += c;
  }
  debit = money(debit);
  credit = money(credit);
  if (debit !== credit) throw new Error(`Posting is not balanced: debits ${debit.toFixed(2)} ≠ credits ${credit.toFixed(2)}.`);
  if (debit === 0) throw new Error("Posting has no amounts.");
  return { debit, credit };
}
