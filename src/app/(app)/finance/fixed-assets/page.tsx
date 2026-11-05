import Link from "next/link";
import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney } from "@/lib/format";
import { param } from "@/lib/forms";
import { formatDmy } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { assetRegister } from "../_cash_fa/asset-data";
import { ASSET_CATEGORIES } from "../_cash_fa/constants";

export const metadata: Metadata = { title: "Fixed Assets" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FixedAssetsPage({ searchParams }: PageProps<"/finance/fixed-assets">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const filter = { q: param(sp, "q"), category: param(sp, "category"), status: param(sp, "status"), branchId: param(sp, "branch") };
  const [rows, branches] = await Promise.all([
    assetRegister(filter),
    db.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const active = rows.filter((r) => r.status === "ACTIVE");
  const totalCost = active.reduce((s, r) => s + r.costN, 0);
  const totalAcc = active.reduce((s, r) => s + r.accumulatedN, 0);
  const exportQs = new URLSearchParams(Object.entries({ q: filter.q, category: filter.category, status: filter.status, branch: filter.branchId }).filter(([, v]) => v)).toString();

  return (
    <>
      <PageHeader
        title="Fixed Assets"
        description="Property, plant and equipment with cost, depreciation and net block."
        actions={
          <>
            <a href={`/finance/fixed-assets/export${exportQs ? `?${exportQs}` : ""}`} className={buttonClass("secondary")}>
              Export Excel
            </a>
            {can(user, "finance", "edit") && <ButtonLink href="/finance/fixed-assets/new">New asset</ButtonLink>}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Gross block (cost)" value={formatMoney(totalCost)} hint={`${active.length} active asset${active.length === 1 ? "" : "s"}`} />
        <StatCard label="Accumulated depreciation" value={formatMoney(totalAcc)} />
        <StatCard label="Net block" value={formatMoney(totalCost - totalAcc)} />
      </div>
      <Card>
        <ListToolbar
          q={filter.q}
          placeholder="Search code, name, location"
          filter={{ name: "status", value: filter.status, allLabel: "Active and disposed", options: [{ value: "ACTIVE", label: "Active" }, { value: "DISPOSED", label: "Disposed" }] }}
        >
          <Select name="category" defaultValue={filter.category} className="w-auto" aria-label="Category">
            <option value="">All categories</option>
            {ASSET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select name="branch" defaultValue={filter.branchId} className="w-auto" aria-label="Branch">
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </ListToolbar>
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Category</TH>
              <TH>Branch / location</TH>
              <TH>Acquired</TH>
              <TH>Method</TH>
              <TH align="right">Cost</TH>
              <TH align="right">Acc. depreciation</TH>
              <TH align="right">Net block</TH>
              <TH>Depreciated to</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={11} />}
            {rows.map((a) => (
              <TR key={a.id}>
                <TD className="font-mono text-xs text-ink-soft">{a.code}</TD>
                <TD>
                  <Link href={`/finance/fixed-assets/${a.id}`} className="font-medium text-brand-700 hover:underline">
                    {a.name}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{a.category}</TD>
                <TD className="text-ink-soft">
                  {a.branch?.name ?? "—"}
                  {a.location && <div className="text-xs">{a.location}</div>}
                </TD>
                <TD className="whitespace-nowrap">{formatDmy(a.acquisitionDate)}</TD>
                <TD className="text-ink-soft">{a.method}</TD>
                <TD align="right">{formatMoney(a.costN)}</TD>
                <TD align="right">{formatMoney(a.accumulatedN)}</TD>
                <TD align="right">{formatMoney(a.bookValue)}</TD>
                <TD className="whitespace-nowrap text-ink-soft">{a.depreciatedTo ? formatDmy(a.depreciatedTo) : "—"}</TD>
                <TD>
                  <StatusBadge status={a.status} />
                </TD>
              </TR>
            ))}
            {rows.length > 0 && (
              <TR className="font-medium">
                <TD colSpan={6}>Total (active assets)</TD>
                <TD align="right">{formatMoney(totalCost)}</TD>
                <TD align="right">{formatMoney(totalAcc)}</TD>
                <TD align="right">{formatMoney(totalCost - totalAcc)}</TD>
                <TD colSpan={2} />
              </TR>
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
