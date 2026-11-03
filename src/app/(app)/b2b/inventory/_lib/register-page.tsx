import "server-only";
import type { NextRequest } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { REGISTERS, showValue, type RegisterKind } from "@/lib/batch-inventory";
import { RegisterSheet } from "../_components/register-sheet";
import { loadRegister } from "./registers-server";
import { exportGuard, xlsxResponse } from "./xlsx-response";

/** The Lost and Found / Damage and Relabelling page. */
export async function RegisterPage({ kind, q }: { kind: RegisterKind; q: string }) {
  const user = await requireUser("batchInventory");
  const R = REGISTERS[kind];
  const [rows, inward] = await Promise.all([
    loadRegister(kind),
    db.batchInward.findMany({ where: { deletedAt: null }, select: { productName: true, catalogueName: true }, distinct: ["productName", "catalogueName"] }),
  ]);
  const names = [...new Set(inward.flatMap((r) => [r.catalogueName, r.productName]).filter((x): x is string => !!x))].sort();
  return (
    <>
      <PageHeader title={R.label} description={R.intro} />
      <RegisterSheet kind={kind} rows={rows} names={names} today={todayIso()} canEdit={can(user, "batchInventory", "edit")} initialQ={q} />
    </>
  );
}

/** GET <register>/export?q=&status=&type= — every field, headed by its label. */
export async function registerExport(kind: RegisterKind, request: NextRequest): Promise<Response> {
  const denied = await exportGuard();
  if (denied) return denied;
  const R = REGISTERS[kind];
  const sp = request.nextUrl.searchParams;
  const t = (sp.get("q") ?? "").trim().toLowerCase();
  const status = sp.get("status") ?? "";
  const type = sp.get("type") ?? "";
  const rows = (await loadRegister(kind)).filter(
    (r) => (!status || r.status === status) && (!type || r.type === type) && (!t || R.fields.some((f) => String(r[f.key] ?? "").toLowerCase().includes(t))),
  );
  return xlsxResponse(`${R.label} ${todayIso()}`, [
    { name: R.label, rows: rows.map((r) => Object.fromEntries(R.fields.map((f) => [f.label, f.kind === "date" ? showValue(f, r[f.key]) : (r[f.key] ?? "")]))) },
  ]);
}
