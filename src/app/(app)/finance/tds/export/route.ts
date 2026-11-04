import type { NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { tdsQuarterOf } from "@/lib/finance/chart";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { num } from "@/lib/format";
import { formatDmy, todayIso } from "@/lib/ops/dates";
import { financeExportGuard, xlsxResponse } from "../../reports/_lib/xlsx";
import { STATUSES, kindOf } from "../_lib/tds";

/** GET /finance/tds/export — the TDS / TCS entries for the same filters as the list. */
export async function GET(request: NextRequest) {
  const denied = await financeExportGuard();
  if (denied) return denied;
  await ensureFinanceSetup();
  const sp = request.nextUrl.searchParams;
  const kind = kindOf(sp.get("kind"));
  const quarter = sp.get("quarter") || tdsQuarterOf(todayIso());
  const section = sp.get("section");
  const status = sp.get("status") ?? "";
  const q = sp.get("q");
  const where: Prisma.TdsEntryWhereInput = {
    kind,
    ...(quarter !== "all" && { quarter }),
    ...(section && { sectionId: section }),
    ...(STATUSES.includes(status as (typeof STATUSES)[number]) && { status }),
    ...(q && { OR: [{ contact: { name: { contains: q, mode: "insensitive" } } }, { documentNo: { contains: q, mode: "insensitive" } }, { challanNo: { contains: q, mode: "insensitive" } }] }),
  };
  const entries = await db.tdsEntry.findMany({
    where,
    orderBy: [{ date: "asc" }],
    include: { section: { select: { code: true } }, contact: { select: { name: true, pan: true, gstin: true } } },
  });
  return xlsxResponse(`${kind} entries ${quarter}`, [
    {
      name: `${kind} entries`,
      rows: entries.map((e) => ({
        Date: formatDmy(e.date),
        Quarter: e.quarter,
        Section: e.section.code,
        Party: e.contact.name,
        PAN: e.contact.pan ?? "",
        GSTIN: e.contact.gstin ?? "",
        Document: [e.documentType, e.documentNo].filter(Boolean).join(" "),
        "Base amount": num(e.baseAmount),
        "Rate %": num(e.rate),
        [kind]: num(e.amount),
        Status: e.status,
        "Challan no.": e.challanNo ?? "",
        "Challan date": formatDmy(e.challanDate),
      })),
    },
  ]);
}
